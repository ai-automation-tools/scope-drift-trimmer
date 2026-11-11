// Platform-shaped draft changes. Strings only: nothing here sends or runs a draft.
import type { AwsRecommendation } from "./inventory.ts";
import type { Grant, Identity } from "./types.ts";

export const DRAFT_PREFIX = "DRAFT. A human reviews and runs this. Validate against the target environment first.";

/** Input is hostile: strip control characters so a value can't forge extra draft lines. */
export const clean = (v: unknown) => String(v).replace(/\p{Cc}/gu, " ");

const nativeId = (identity: Identity) => clean(identity.id.slice(identity.id.indexOf(":") + 1));

type Template = (identity: Identity, grants: Grant[], recommendations?: AwsRecommendation[]) => string[];

// Entra: Graph v1.0. Application permissions are removed through the resource service
// principal's appRoleAssignedTo, the form Microsoft recommends:
// https://learn.microsoft.com/graph/api/serviceprincipal-delete-approleassignedto
// The resource id isn't in the inventory, so the draft says how to look it up.
// Delegated grants have ids "oauth2PermissionGrant/<id>[/<scope>]" by this repo's convention:
// https://learn.microsoft.com/graph/api/oauth2permissiongrant-delete
const entra: Template = (identity, grants) => {
  const sp = nativeId(identity).replace(/^sp\//, "");
  return grants.flatMap((g) => {
    const delegated = g.id.match(/^oauth2PermissionGrant\/([^/]+)/);
    if (delegated) {
      return [
        `# Remove delegated ${clean(g.permission)} from ${clean(identity.displayName)}. This deletes every scope in the grant; to drop only this one, PATCH the grant's scope instead.`,
        `DELETE https://graph.microsoft.com/v1.0/oauth2PermissionGrants/${clean(delegated[1])}`,
      ];
    }
    const assignment = clean(g.id.replace(/^appRoleAssignment\//, ""));
    return [
      `# Remove application permission ${clean(g.permission)} from ${clean(identity.displayName)}. {resource-sp-id} is the assignment's resourceId: GET https://graph.microsoft.com/v1.0/servicePrincipals/${sp}/appRoleAssignments/${assignment}`,
      `DELETE https://graph.microsoft.com/v1.0/servicePrincipals/{resource-sp-id}/appRoleAssignedTo/${assignment}`,
    ];
  });
};

// AWS: IAM Access Analyzer's own recommended change when the import carries one, otherwise a
// statement diff removing only the named management actions.
const aws: Template = (identity, grants, recommendations) => [
  ...(recommendations?.length
    ? [
        `# Role ${nativeId(identity)}: unused ${grants.map((g) => clean(g.permission)).join(", ")}. IAM Access Analyzer's recommended change follows; it covers every unused action in the policy at once.`,
        ...recommendations.flatMap((r) => [
          `# ${clean(r.action)}${r.existingPolicyId ? ` ${clean(r.existingPolicyId)}` : ""}${r.recommendedPolicy ? ": replace it with this policy" : ""}`,
          ...(r.recommendedPolicy ? prettyPolicy(r.recommendedPolicy) : []),
        ]),
      ]
    : [
        `# Role ${nativeId(identity)}: remove these actions from its policy statements`,
        ...grants.map((g) => `-   "${clean(g.permission)}",`),
      ]),
  "# Warning: IAM last-accessed data does not include data-plane actions (S3 object reads and writes, DynamoDB items, Lambda invokes and others). Check the role's data-plane use, for example in CloudTrail data events, before removing anything wider than these actions.",
];

/** The analyzer's policy JSON, indented; left as one cleaned line if it doesn't parse. */
function prettyPolicy(policy: string): string[] {
  try {
    return JSON.stringify(JSON.parse(policy), null, 2).split("\n").map(clean);
  } catch {
    return [clean(policy)];
  }
}

const github = (identity: Identity, grants: Grant[], after: (g: Grant) => string) => [
  `# GitHub App installation ${nativeId(identity)} (${clean(identity.displayName)})`,
  "Before:",
  ...grants.map((g) => `  ${clean(g.permission)}: ${clean(g.access ?? "other")}`),
  "After:",
  ...grants.map(after),
  "# The installation must be re-approved by an organization owner after the permission change.",
];

// Okta: "Revoke an app grant" and "Grant consent to scope", Okta Management API, checked
// 2026-11-05 at https://developer.okta.com/docs/api/openapi/okta-management/management/tag/ApplicationGrants/
// Revoke needs the okta.appGrants.manage scope.
const okta: Template = (identity, grants) => {
  const appId = nativeId(identity).replace(/^app\//, "");
  return grants.flatMap((g) => {
    const read = /\.manage$/.test(g.permission) ? clean(g.permission.replace(/\.manage$/, ".read")) : null;
    return [
      `# Revoke ${clean(g.permission)} from ${clean(identity.displayName)}`,
      `DELETE https://{yourOktaDomain}/api/v1/apps/${appId}/grants/${clean(g.id)}`,
      ...(read
        ? [
            `# If the System Log shows the app only reads, grant ${read} back:`,
            `POST https://{yourOktaDomain}/api/v1/apps/${appId}/grants {"issuer": "https://{yourOktaDomain}", "scopeId": "${read}"}`,
          ]
        : []),
    ];
  });
};

const generic: Template = (identity, grants) =>
  grants.map(
    (g) => `Remove ${clean(g.permission)} on ${clean(g.resource)} (grant ${clean(g.id)}) from ${clean(identity.id)} in the ${clean(identity.platform)} console.`,
  );

const REMOVAL: Record<string, Template> = {
  "azure-entra": entra,
  aws,
  github: (identity, grants) => github(identity, grants, (g) => `  ${clean(g.permission)}: none`),
  okta,
};

/** A draft that removes `grants` from `identity`, using the platform's own recommendation if given. */
export function draftRemoval(identity: Identity, grants: Grant[], recommendations?: AwsRecommendation[]): string {
  const template = Object.hasOwn(REMOVAL, identity.platform) ? REMOVAL[identity.platform] : generic;
  return [DRAFT_PREFIX, ...template(identity, grants, recommendations)].join("\n");
}

/** A draft that swaps `grant` for the narrower `replacement`. */
export function draftNarrowing(identity: Identity, grant: Grant, replacement: string): string {
  const body =
    identity.platform === "github"
      ? github(identity, [grant], (g) => `  ${clean(replacement)}: ${clean(g.access ?? "write")}`)
      : [`Replace ${clean(grant.permission)} on ${clean(grant.resource)} with ${clean(replacement)} for ${clean(identity.id)} in the ${clean(identity.platform)} console.`];
  return [DRAFT_PREFIX, ...body].join("\n");
}
