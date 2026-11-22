// Okta import: service apps from the OAuth Client API, their scope grants and 90 days of System
// Log events for them, as the README's PowerShell writes them (one JSON array per page).
// Shapes, checked 2026-11-21:
// https://developer.okta.com/docs/api/openapi/okta-oauth/oauth/client/listclients
//   ("Okta uses the app ID for the client_id"; client_secret is only returned on create)
// https://developer.okta.com/docs/api/openapi/okta-management/management/tags/applicationgrants/other/listscopeconsentgrants
// https://developer.okta.com/docs/api/openapi/okta-management/management/tags/systemlog/other/listlogevents
// https://developer.okta.com/docs/reference/api/event-types/
// https://developer.okta.com/docs/reference/system-log-query/ ("System Log data older than 90 days isn't returned")
// Okta documents neither which LogEvent field names the OAuth client nor where a token's scopes
// sit, and says debugData keys "aren't guaranteed to be stable". So events are matched to an app
// by actor id, the scopes are read from debugData.grantedScopes, and the evidence says both are
// inference.
import { isoTime, readJson, type Adapter, type SdtExtensions } from "./inventory.ts";
import type { Access, Grant, Identity, InputFile } from "./types.ts";

/** Okta keeps 90 days of System Log, so every Okta grant is judged over that window. */
export const OKTA_WINDOW_DAYS = 90;
const DAY = 86_400_000;

/** Access tokens from the org authorization server (okta.* scopes) and from a custom one. */
const TOKEN_EVENTS = new Set(["app.oauth2.token.grant.access_token", "app.oauth2.as.token.grant.access_token"]);

/**
 * The System Log write events that count as use of a .manage scope. Okta logs writes, not
 * reads, so a .manage scope carried in tokens with none of these events reads as read-only use.
 * This mapping is this tool's inference, not Okta's: bump `version` when it changes.
 * ponytail: three scopes; an unmapped .manage scope is never read as read-only.
 */
export const OKTA_WRITE_EVENTS: { version: string; prefixes: Record<string, string[]> } = {
  version: "2026-11-21",
  prefixes: {
    "okta.users.manage": ["user.lifecycle.", "user.account."],
    "okta.groups.manage": ["group."],
    "okta.apps.manage": ["application."],
  },
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

type Kind = "client" | "grant" | "event";
function kindOf(o: Obj): Kind | null {
  if (typeof o.client_id === "string" && typeof o.application_type === "string") return "client";
  if (typeof o.scopeId === "string" && typeof o.issuer === "string") return "grant";
  if (typeof o.eventType === "string" && typeof o.published === "string" && typeof o.uuid === "string") return "event";
  return null;
}

/** A page is a JSON array (PowerShell can collapse a one-item page to its object). */
const docs = (doc: unknown): Obj[] | null => {
  const list = Array.isArray(doc) ? doc : [doc];
  return list.length > 0 && list.every((o) => isObj(o) && kindOf(o) !== null) ? (list as Obj[]) : null;
};

/** ponytail: name-based access level; Okta's per-scope reference is the upgrade. */
function access(scope: string): Access {
  if (/^okta\.(roles|apps|clients|appGrants|apiTokens|authorizationServers|policies|idps|orgs)\.manage$/.test(scope)) return "admin";
  if (/\.manage$/.test(scope)) return "write";
  return /\.read$/.test(scope) ? "read" : "other";
}

const latest = (times: (string | null)[]) => times.filter((t): t is string => t !== null).sort().pop() ?? null;

function read(files: InputFile[], asOf: Date) {
  const all = files.flatMap((f) => (docs(readJson(f)) ?? []).map((o) => ({ file: f.name, o, kind: kindOf(o)! })));
  const since = asOf.getTime() - OKTA_WINDOW_DAYS * DAY;
  const logFiles = [...new Set(all.filter((i) => i.kind === "event").map((i) => i.file))];
  const events = all
    .filter((i) => i.kind === "event")
    .map((i) => ({ ...i, at: isoTime(i.o.published, i.file)! }))
    .filter((e) => Date.parse(e.at) >= since && Date.parse(e.at) <= asOf.getTime());
  // Client-credentials apps only: other OAuth apps act for people, and people are out of scope.
  const clients = all.filter((i) => i.kind === "client" && i.o.application_type === "service");

  return clients.map(({ file, o: client }) => {
    const appId = str(client.client_id);
    const sources = new Set([file, ...logFiles]);
    const mine = events.filter((e) => isObj(e.o.actor) && (e.o.actor.id === appId || e.o.actor.alternateId === appId));
    const tokens = mine.filter((e) => TOKEN_EVENTS.has(str(e.o.eventType)) && (!isObj(e.o.outcome) || e.o.outcome.result === undefined || e.o.outcome.result === "SUCCESS"));
    const scopesOf = (e: (typeof tokens)[number]) => {
      const debug = isObj(e.o.debugContext) && isObj(e.o.debugContext.debugData) ? e.o.debugContext.debugData : {};
      return typeof debug.grantedScopes === "string" ? debug.grantedScopes.split(/[\s,]+/).filter(Boolean) : null;
    };
    // Scopes are judged only when the log is in the export and, if the app got tokens, every
    // token says which scopes it carried. A scope in no token can't have been used: every Okta
    // API call needs a token that carries it.
    const judged = logFiles.length > 0 && (mine.length === 0 || (tokens.length > 0 && tokens.every((e) => scopesOf(e) !== null)));
    const readOnly: string[] = [];

    const grants: Grant[] = all
      .filter((i) => i.kind === "grant" && i.o.clientId === appId && i.o.status === "ACTIVE")
      .map(({ file: grantFile, o: g }) => {
        sources.add(grantFile);
        const scope = str(g.scopeId);
        const issuer = str(g.issuer);
        const usedAt = latest(tokens.filter((e) => scopesOf(e)?.includes(scope)).map((e) => e.at));
        const writes = Object.hasOwn(OKTA_WRITE_EVENTS.prefixes, scope) ? OKTA_WRITE_EVENTS.prefixes[scope] : null;
        if (judged && usedAt && writes && !mine.some((e) => writes.some((p) => str(e.o.eventType).startsWith(p)))) readOnly.push(str(g.id));
        return {
          id: str(g.id),
          resource: /\/oauth2\//.test(issuer) ? `okta:${issuer}` : "okta:org",
          permission: scope,
          access: access(scope),
          grantedAt: isoTime(g.created, grantFile),
          ...(g.source === "ADMIN" ? { grantedBy: "admin consent" } : {}),
          ...(judged ? { lastUsedAt: usedAt, usageKnown: true, observationDays: OKTA_WINDOW_DAYS } : { usageKnown: false }),
        };
      });

    const identity: Identity = {
      id: `okta:app/${appId}`,
      kind: "service-account",
      platform: "okta",
      displayName: str(client.client_name) || appId,
      status: "active",
      // Unknown (absent) without a System Log; null when the log holds no event by the app.
      ...(logFiles.length ? { lastUsedAt: latest(mine.map((e) => e.at)) } : {}),
      grants,
    };
    return { identity, sources: [...sources].sort(), readOnly };
  });
}

export const oktaAdapter: Adapter = {
  name: "okta",
  accepts: (doc) => docs(doc) !== null,
  parse: (files, asOf = new Date()) => read(files, asOf).map((r) => r.identity),
  extensions(files, asOf = new Date()): SdtExtensions {
    const apps = read(files, asOf);
    const readOnly = apps.filter((a) => a.readOnly.length);
    return {
      sources: Object.fromEntries(apps.map((a) => [a.identity.id, a.sources])),
      ...(readOnly.length ? { oktaReadOnly: Object.fromEntries(readOnly.map((a) => [a.identity.id, a.readOnly])) } : {}),
    };
  },
};
