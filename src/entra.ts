// Entra import: a Microsoft Graph export of service principals (with owners expanded),
// their appRoleAssignments, oauth2PermissionGrants and the beta servicePrincipalSignInActivity
// report, written by the README's PowerShell snippet as { "value": [...] } files. Shapes,
// checked 2026-11-10:
// https://learn.microsoft.com/graph/api/resources/serviceprincipal
// https://learn.microsoft.com/graph/api/resources/approleassignment
// https://learn.microsoft.com/graph/api/resources/oauth2permissiongrant
// https://learn.microsoft.com/graph/api/resources/serviceprincipalsigninactivity?view=graph-rest-beta
// The sign-in report needs Entra ID P1 or P2:
// https://learn.microsoft.com/entra/identity/monitoring-health/concept-usage-insights-report
import { isoTime, readJson, type Adapter, type SdtExtensions } from "./inventory.ts";
import type { Access, Credential, Grant, Identity, InputFile } from "./types.ts";

/** Entra keeps no per-permission use, so this tool judges every grant over a fixed window. */
export const ENTRA_WINDOW_DAYS = 90;
const DAY = 86_400_000;
/** Microsoft's own tenant: its first-party service principals aren't the reviewer's NHIs. */
const MICROSOFT_TENANT = "f8cdef31-a31e-4b4a-93e4-5f571e91255a";
const GRAPH_APP_ID = "00000003-0000-0000-c000-000000000000";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");

type Kind = "sp" | "assignment" | "grant" | "signIn";
function kindOf(o: Obj): Kind | null {
  if ("lastSignInActivity" in o) return "signIn";
  if ("appRoleId" in o && "principalId" in o && "resourceId" in o) return "assignment";
  if ("clientId" in o && "consentType" in o && "scope" in o) return "grant";
  if ("servicePrincipalType" in o || "appRoles" in o) return "sp";
  return null;
}

/** A Graph collection page; an empty one counts when Graph's @odata.context says what it is. */
function items(doc: unknown): Obj[] | null {
  if (!isObj(doc) || !Array.isArray(doc.value)) return null;
  if (doc.value.length === 0) return str(doc["@odata.context"]).includes("graph.microsoft.com") ? [] : null;
  return doc.value.every((o) => isObj(o) && kindOf(o) !== null) ? (doc.value as Obj[]) : null;
}

/** ponytail: name-based access level; Microsoft's permissions reference is the upgrade. */
function access(permission: string): Access {
  if (/^(RoleManagement|AppRoleAssignment|Application|Directory|Policy)\.ReadWrite|AccessAsUser/.test(permission)) return "admin";
  if (/ReadWrite|Send|Write|Manage|Create|Delete|Invite|FullControl|Impersonat/.test(permission)) return "write";
  return /Read/.test(permission) ? "read" : "other";
}

function credentials(sp: Obj, file: string): Credential[] {
  // Only ids and dates are copied. secretText, hint and key never leave this function.
  const cred = (c: Obj, type: Credential["type"]): Credential => ({
    id: `${type === "certificate" ? "keyCredential" : "passwordCredential"}/${str(c.keyId)}`,
    type,
    ...(/^[A-Za-z0-9:_-]{4,64}$/.test(str(c.keyId)) ? { fingerprint: str(c.keyId) } : {}),
    location: "platform",
    createdAt: isoTime(c.startDateTime, file),
    expiresAt: isoTime(c.endDateTime, file),
  });
  return [...arr(sp.passwordCredentials).map((c) => cred(c, "api-key")), ...arr(sp.keyCredentials).map((c) => cred(c, "certificate"))];
}

function owner(sp: Obj): Identity["owner"] {
  if (!Array.isArray(sp.owners)) return undefined; // not exported: unknown, not "none"
  const o = arr(sp.owners)[0];
  if (!o) return null;
  const email = [o.mail, o.userPrincipalName].map(str).find((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return { ...(str(o.displayName) ? { name: str(o.displayName) } : {}), ...(email ? { email } : {}) };
}

function read(files: InputFile[], asOf: Date) {
  const all = files.flatMap((f) => (items(readJson(f)) ?? []).map((o) => ({ file: f.name, o, kind: kindOf(o)! })));
  const of = (k: Kind) => all.filter((i) => i.kind === k);
  const sps = new Map(of("sp").map((i) => [str(i.o.id), i]));
  const signIns = new Map(of("signIn").map((i) => [str(i.o.appId), i]));
  const since = asOf.getTime() - ENTRA_WINDOW_DAYS * DAY;

  const resourceName = (resourceId: string, permission: string) => {
    const r = sps.get(resourceId)?.o;
    return r && str(r.appId) === GRAPH_APP_ID ? `graph:${permission}` : `${str(r?.displayName) || resourceId}:${permission}`;
  };

  return [...sps.values()]
    .filter(({ o }) => str(o.appOwnerOrganizationId) !== MICROSOFT_TENANT)
    .map(({ file, o: sp }) => {
      const sources = new Set([file]);
      const signIn = signIns.get(str(sp.appId));
      // The latest timestamp across the report's sign-in kinds; null when it records none.
      const lastUsedAt = signIn
        ? (Object.entries(signIn.o).filter(([k, v]) => k.endsWith("SignInActivity") && isObj(v))
            .map(([, v]) => isoTime((v as Obj).lastSignInDateTime, signIn.file))
            .filter((t): t is string => t !== null).sort().pop() ?? null)
        : undefined;
      if (signIn) sources.add(signIn.file);
      // Entra records sign-ins per app, not per permission: grants are judged only when the
      // app never signed in inside the window. Otherwise their use is unknown.
      const usage: Partial<Grant> =
        lastUsedAt === undefined || (lastUsedAt !== null && Date.parse(lastUsedAt) >= since)
          ? { usageKnown: false }
          : { lastUsedAt: null, usageKnown: true, observationDays: ENTRA_WINDOW_DAYS };

      const grants: Grant[] = [];
      for (const { file, o: a } of of("assignment").filter((i) => str(i.o.principalId) === str(sp.id))) {
        sources.add(file);
        const role = arr(sps.get(str(a.resourceId))?.o.appRoles).find((r) => str(r.id) === str(a.appRoleId));
        const permission = str(role?.value) || str(a.appRoleId);
        grants.push({
          id: `appRoleAssignment/${str(a.id)}`,
          resource: resourceName(str(a.resourceId), permission),
          permission,
          access: access(permission),
          grantedAt: isoTime(a.createdDateTime, file),
          ...usage,
        });
      }
      for (const { file, o: g } of of("grant").filter((i) => str(i.o.clientId) === str(sp.id))) {
        sources.add(file);
        for (const scope of str(g.scope).split(/\s+/).filter(Boolean)) {
          grants.push({
            id: `oauth2PermissionGrant/${str(g.id)}/${scope}`,
            resource: resourceName(str(g.resourceId), scope),
            permission: scope,
            access: access(scope),
            ...(g.consentType === "AllPrincipals" ? { grantedBy: "admin consent for all users" } : {}),
            ...usage,
          });
        }
      }

      const own = owner(sp);
      const creds = credentials(sp, file);
      const identity: Identity = {
        id: `azure-entra:sp/${str(sp.id)}`,
        kind: sp.servicePrincipalType === "ManagedIdentity" ? "workload" : "oauth-app",
        platform: "azure-entra",
        displayName: str(sp.displayName) || str(sp.appId),
        ...(own !== undefined ? { owner: own } : {}),
        status: sp.accountEnabled === false ? "disabled" : "active",
        ...(lastUsedAt !== undefined ? { lastUsedAt } : {}),
        ...(creds.length ? { credentials: creds } : {}),
        grants,
      };
      return { identity, sources: [...sources].sort() };
    });
}

export const entraAdapter: Adapter = {
  name: "entra",
  accepts: (doc) => items(doc) !== null,
  parse: (files, asOf = new Date()) => read(files, asOf).map((r) => r.identity),
  extensions: (files, asOf = new Date()): SdtExtensions => ({
    sources: Object.fromEntries(read(files, asOf).map((r) => [r.identity.id, r.sources])),
  }),
};
