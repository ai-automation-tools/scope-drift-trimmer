// The four rules. A grant is judged used or unused only when the platform records its use
// (usageKnown: true) over a stated window; silence is never read as "unused".
import { clean, draftNarrowing, draftRemoval } from "./remediation.ts";
import type { AwsRecommendation } from "./inventory.ts";
import { OKTA_WRITE_EVENTS } from "./okta.ts";
import type { Finding, Grant, Identity } from "./types.ts";

const DAY = 86_400_000;
const RULE = "scope-drift-trimmer/";

export interface RuleContext {
  /** End of the observation window: the input document's generatedAt, in ms. */
  asOf: number;
  /** The input file's name, for evidence. */
  source: string;
  /** The export files each identity was imported from, when it was (x["scope-drift-trimmer"]). */
  sources?: Record<string, string[]>;
  /** IAM Access Analyzer's recommended policy steps, per identity id. */
  awsRecommendations?: Record<string, AwsRecommendation[]>;
  /** Okta .manage grants used, by inference, only to read, per identity id. */
  oktaReadOnly?: Record<string, string[]>;
}

/** A finding plus the grant ids it calls unused, kept for the no-false-unused check. */
export interface RuleFinding extends Finding {
  unusedGrantIds: string[];
}

/** Sensitive permissions with a narrower alternative. Bump `version` when entries change. */
export const NARROWER_PERMISSIONS = {
  version: "2026-11-05",
  entries: [
    {
      platform: "github",
      permission: "administration",
      access: ["write", "admin"],
      narrower: "repository_creation",
      basis: "GitHub changelog, 2026-10-13: apps that only create repositories can hold the repository_creation permission instead of administration",
    },
  ],
};

const isPrivileged = (g: Grant) => g.access === "write" || g.access === "admin";
const usedSince = (ts: string | null | undefined, since: number) => ts != null && Date.parse(ts) >= since;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const names = (grants: Grant[]) => grants.map((g) => clean(g.permission)).join(", ");

/**
 * Whether the rules may judge this grant's use. AWS wildcards never are: last-accessed data
 * leaves out data-plane actions, so narrowing one from it would break a working role.
 */
const judgeable = (identity: Identity, g: Grant): g is Grant & { observationDays: number } =>
  g.usageKnown === true &&
  g.observationDays !== undefined &&
  !(identity.platform === "aws" && g.permission.includes("*"));

/** "none" only when the source records no owner; "unknown" when it doesn't carry owners. */
const ownership = (identity: Identity) => {
  const o = identity.owner;
  if (o === undefined) return "unknown";
  return o !== null && Boolean(o.name || o.email || o.team) ? "owned" : "none";
};

/** The file names the identity's data came from. Hostile x data falls back to the input file. */
const sourceOf = (identity: Identity, ctx: RuleContext) => {
  const s = ctx.sources && Object.hasOwn(ctx.sources, identity.id) ? ctx.sources[identity.id] : undefined;
  return clean(Array.isArray(s) && s.length ? `${s.join(", ")} (imported)` : ctx.source);
};

const recommendations = (identity: Identity, ctx: RuleContext) => {
  const r = ctx.awsRecommendations && Object.hasOwn(ctx.awsRecommendations, identity.id) ? ctx.awsRecommendations[identity.id] : undefined;
  return Array.isArray(r) ? r : undefined;
};

/** Why a write/admin grant's use can't be judged, in the platform's terms. */
function whyNotJudged(identity: Identity, g: Grant): string {
  if (identity.platform === "aws" && g.permission.includes("*")) return "an AWS wildcard, which last-accessed data can't narrow";
  if (g.usageKnown === true) return "no observation window stated";
  if (identity.platform === "azure-entra") {
    return identity.lastUsedAt
      ? `Entra records sign-ins per app, not per permission, and this app last signed in ${clean(identity.lastUsedAt)}`
      : "the export holds no sign-in activity record for this app";
  }
  if (identity.platform === "aws") {
    return g.permission === "iam:PassRole" ? "IAM records no use of iam:PassRole" : "IAM last-accessed data leaves out data-plane actions like this one";
  }
  if (identity.platform === "github") return "GitHub records no per-permission use for App permissions";
  if (identity.platform === "okta") {
    return identity.lastUsedAt === undefined
      ? "the export holds no Okta System Log"
      : "the System Log has events for this app but no access-token events that record their scopes";
  }
  return "the platform records no use of it";
}

const finding = (rule: string, identity: Identity, suffix: string, f: Omit<RuleFinding, "id" | "identityId" | "ruleId" | "status">): RuleFinding => ({
  id: `${RULE}${rule}:${identity.id}${suffix}`,
  identityId: identity.id,
  ruleId: RULE + rule,
  status: "open",
  ...f,
});

function dormantPrivilegedIdentity(identity: Identity, ctx: RuleContext): RuleFinding | null {
  const grants = identity.grants ?? [];
  const known = grants.filter((g) => judgeable(identity, g));
  // Identity-level use must be on record (lastUsedAt present, null meaning none); an import can
  // list only some of an identity's grants, so unused grants alone don't make it dormant.
  if (known.length === 0 || identity.lastUsedAt === undefined) return null;
  const days = Math.min(...known.map((g) => g.observationDays));
  const since = ctx.asOf - days * DAY;
  if (usedSince(identity.lastUsedAt, since) || grants.some((g) => usedSince(g.lastUsedAt, since))) return null;
  const unused = known.filter(isPrivileged);
  if (unused.length === 0) return null;
  const notJudged = grants.filter((g) => isPrivileged(g) && !judgeable(identity, g));
  const owner = ownership(identity);
  return finding("dormant-privileged-identity", identity, "", {
    severity: owner === "none" ? "critical" : "high",
    title: `Dormant privileged identity${owner === "none" ? " with no owner" : ""}: ${clean(identity.displayName)} has not been used in ${days} days and holds ${names(unused)}`,
    evidence: [
      `Source: ${sourceOf(identity, ctx)}.`,
      `Window: ${days} days, ${day(since)} to ${day(ctx.asOf)} (shortest observationDays of the identity's usage-recorded grants).`,
      `Identity lastUsedAt: ${clean(identity.lastUsedAt ?? "none recorded")}; no grant was used inside the window.`,
      `Unused write/admin grants (usageKnown: true): ${names(unused)}.`,
      notJudged.length ? `Not judged, because the platform records no use for them: ${names(notJudged)}.` : "",
      owner === "none" ? "Owner: none recorded." : owner === "unknown" ? "Owner: not in the source data." : "",
    ].filter(Boolean).join(" "),
    remediation: draftRemoval(identity, unused, recommendations(identity, ctx)),
    unusedGrantIds: unused.map((g) => g.id),
  });
}

function unusedGrants(identity: Identity, ctx: RuleContext): RuleFinding[] {
  return (identity.grants ?? [])
    .filter((g): g is Grant & { observationDays: number } => judgeable(identity, g) && (isPrivileged(g) || g.access === "read"))
    .filter((g) => !usedSince(g.lastUsedAt, ctx.asOf - g.observationDays * DAY))
    .map((g) =>
      finding("unused-grant", identity, `:${g.id}`, {
        severity: g.access === "read" ? "medium" : "high",
        title: `Unused grant: ${clean(identity.displayName)} holds ${clean(g.permission)} on ${clean(g.resource)}, not used in ${g.observationDays} days`,
        evidence: [
          `Source: ${sourceOf(identity, ctx)}.`,
          `Window: ${g.observationDays} days, ${day(ctx.asOf - g.observationDays * DAY)} to ${day(ctx.asOf)} (the grant's observationDays).`,
          `Grant ${clean(g.id)}, ${clean(g.permission)} (${g.access}) on ${clean(g.resource)}: usageKnown true, lastUsedAt ${clean(g.lastUsedAt ?? "none recorded")}.`,
        ].join(" "),
        remediation: draftRemoval(identity, [g], recommendations(identity, ctx)),
        unusedGrantIds: [g.id],
      }),
    );
}

/**
 * An Okta .manage grant whose tokens were issued but whose writes never showed up in the System
 * Log. Never "unused": the app may read with it, so the draft swaps it for the .read scope.
 */
function oktaReadOnly(identity: Identity, g: Grant, ctx: RuleContext): RuleFinding | null {
  const ids = ctx.oktaReadOnly && Object.hasOwn(ctx.oktaReadOnly, identity.id) ? ctx.oktaReadOnly[identity.id] : undefined;
  const writes = Object.hasOwn(OKTA_WRITE_EVENTS.prefixes, g.permission) ? OKTA_WRITE_EVENTS.prefixes[g.permission] : null;
  if (identity.platform !== "okta" || !Array.isArray(ids) || !ids.includes(g.id) || !writes || !judgeable(identity, g) || !g.lastUsedAt) return null;
  const read = g.permission.replace(/\.manage$/, ".read");
  return finding("narrower-permission-available", identity, `:${g.id}`, {
    severity: "medium",
    title: `Narrower permission available: ${clean(identity.displayName)} holds ${clean(g.permission)} (${g.access}) but the System Log shows no writes; ${read} may be enough`,
    evidence: [
      `Source: ${sourceOf(identity, ctx)}.`,
      `Window: ${g.observationDays} days, ${day(ctx.asOf - g.observationDays * DAY)} to ${day(ctx.asOf)} (the grant's observationDays).`,
      `Access tokens issued to the app carried ${clean(g.permission)} (last ${clean(g.lastUsedAt)}), and the System Log records no ${writes.map((p) => `${p}*`).join(", ")} event by the app in the window.`,
      `Inference: Okta logs writes but not reads, so the app reads as using ${clean(g.permission)} only to read. The event-to-scope mapping is this tool's (version ${OKTA_WRITE_EVENTS.version}), events are matched to the app by actor id, and a token's scopes come from debugData.grantedScopes, which Okta does not guarantee stable.`,
      "This finding does not claim the grant is unused; check what the identity does before narrowing.",
    ].join(" "),
    remediation: draftNarrowing(identity, g, read),
    unusedGrantIds: [],
  });
}

function narrowerPermissionAvailable(identity: Identity, ctx: RuleContext): RuleFinding[] {
  return (identity.grants ?? []).flatMap((g) => {
    const okta = oktaReadOnly(identity, g, ctx);
    if (okta) return [okta];
    const entry = NARROWER_PERMISSIONS.entries.find(
      (e) => e.platform === identity.platform && e.permission === g.permission && e.access.includes(g.access ?? ""),
    );
    if (!entry) return [];
    return [
      finding("narrower-permission-available", identity, `:${g.id}`, {
        severity: "medium",
        title: `Narrower permission available: ${clean(identity.displayName)} holds ${clean(g.permission)} (${g.access}) where ${entry.narrower} may be enough`,
        evidence: [
          `Source: ${sourceOf(identity, ctx)}.`,
          `Data: narrower-permission table version ${NARROWER_PERMISSIONS.version}; ${entry.basis}.`,
          "Window: none; this rule reads the grant list, not usage.",
          `Usage of ${clean(g.permission)}: ${g.usageKnown === true ? "recorded by the platform but not used by this rule" : "unknown, the platform does not record it"}. This finding does not claim the grant is unused; check what the identity does before narrowing.`,
        ].join(" "),
        remediation: draftNarrowing(identity, g, entry.narrower),
        unusedGrantIds: [],
      }),
    ];
  });
}

function usageNotObservable(identity: Identity, ctx: RuleContext): RuleFinding | null {
  const hidden = (identity.grants ?? []).filter((g) => isPrivileged(g) && !judgeable(identity, g));
  if (hidden.length === 0) return null;
  return finding("usage-not-observable", identity, "", {
    severity: "info",
    title: `Use not observable: ${hidden.length} write/admin grant${hidden.length === 1 ? "" : "s"} on ${clean(identity.displayName)} could not be judged`,
    evidence: [
      `Source: ${sourceOf(identity, ctx)}.`,
      `Window: not applicable; there is no per-grant use on record for ${hidden.map((g) => `${clean(g.permission)} (${whyNotJudged(identity, g)})`).join("; ")}.`,
      "No rule judged these grants used or unused.",
    ].join(" "),
    unusedGrantIds: [],
  });
}

/** Every rule over one identity. `unused-grant` stays quiet when the identity is dormant. */
export function runRules(identity: Identity, ctx: RuleContext): RuleFinding[] {
  const dormant = dormantPrivilegedIdentity(identity, ctx);
  const out: RuleFinding[] = dormant ? [dormant] : unusedGrants(identity, ctx);
  out.push(...narrowerPermissionAvailable(identity, ctx));
  const hidden = usageNotObservable(identity, ctx);
  if (hidden) out.push(hidden);
  return out;
}
