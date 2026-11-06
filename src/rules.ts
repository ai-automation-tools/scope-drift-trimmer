// The four rules. A grant is judged used or unused only when the platform records its use
// (usageKnown: true) over a stated window; silence is never read as "unused".
import { clean, draftNarrowing, draftRemoval } from "./remediation.ts";
import type { Finding, Grant, Identity } from "./types.ts";

const DAY = 86_400_000;
const RULE = "scope-drift-trimmer/";

export interface RuleContext {
  /** End of the observation window: the input document's generatedAt, in ms. */
  asOf: number;
  /** The input file's name, for evidence. */
  source: string;
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

const hasOwner = (identity: Identity) => {
  const o = identity.owner;
  return o != null && Boolean(o.name || o.email || o.team);
};

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
  if (known.length === 0) return null; // identity-level use isn't recorded: not judged
  const days = Math.min(...known.map((g) => g.observationDays));
  const since = ctx.asOf - days * DAY;
  if (usedSince(identity.lastUsedAt, since) || grants.some((g) => usedSince(g.lastUsedAt, since))) return null;
  const unused = known.filter(isPrivileged);
  if (unused.length === 0) return null;
  const notJudged = grants.filter((g) => isPrivileged(g) && !judgeable(identity, g));
  const owned = hasOwner(identity);
  return finding("dormant-privileged-identity", identity, "", {
    severity: owned ? "high" : "critical",
    title: `Dormant privileged identity${owned ? "" : " with no owner"}: ${clean(identity.displayName)} has not been used in ${days} days and holds ${names(unused)}`,
    evidence: [
      `Source: ${clean(ctx.source)}.`,
      `Window: ${days} days, ${day(since)} to ${day(ctx.asOf)} (shortest observationDays of the identity's usage-recorded grants).`,
      `Identity lastUsedAt: ${clean(identity.lastUsedAt ?? "none recorded")}; no grant was used inside the window.`,
      `Unused write/admin grants (usageKnown: true): ${names(unused)}.`,
      notJudged.length ? `Not judged, because the platform records no use for them: ${names(notJudged)}.` : "",
      owned ? "" : "Owner: none recorded.",
    ].filter(Boolean).join(" "),
    remediation: draftRemoval(identity, unused),
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
          `Source: ${clean(ctx.source)}.`,
          `Window: ${g.observationDays} days, ${day(ctx.asOf - g.observationDays * DAY)} to ${day(ctx.asOf)} (the grant's observationDays).`,
          `Grant ${clean(g.id)}, ${clean(g.permission)} (${g.access}) on ${clean(g.resource)}: usageKnown true, lastUsedAt ${clean(g.lastUsedAt ?? "none recorded")}.`,
        ].join(" "),
        remediation: draftRemoval(identity, [g]),
        unusedGrantIds: [g.id],
      }),
    );
}

function narrowerPermissionAvailable(identity: Identity, ctx: RuleContext): RuleFinding[] {
  return (identity.grants ?? []).flatMap((g) => {
    const entry = NARROWER_PERMISSIONS.entries.find(
      (e) => e.platform === identity.platform && e.permission === g.permission && e.access.includes(g.access ?? ""),
    );
    if (!entry) return [];
    return [
      finding("narrower-permission-available", identity, `:${g.id}`, {
        severity: "medium",
        title: `Narrower permission available: ${clean(identity.displayName)} holds ${clean(g.permission)} (${g.access}) where ${entry.narrower} may be enough`,
        evidence: [
          `Source: ${clean(ctx.source)}.`,
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
      `Source: ${clean(ctx.source)}.`,
      `Window: not applicable; the platform records no per-grant use for ${names(hidden)}`,
      "(usageKnown false, no observation window, or an AWS wildcard that last-accessed data can't narrow).",
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
