<a id="rules-top"></a>

<h1 align="center">📏 Rule catalog</h1>

<p align="center">
  <em>The four rules, what each needs before it speaks, and how the importers decide what a platform actually recorded.</em>
</p>

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/↩-docs_home-6B7280?style=for-the-badge" alt="Back to docs"></a>
</p>

---

Every rule reads the same thing: identities and grants in the agent inventory format, schema
v0.1. The rules live in [`src/rules.ts`](../src/rules.ts) and the drafts in
[`src/remediation.ts`](../src/remediation.ts). The CLI and the demo run the same code.

## The one rule behind the rules

A grant is judged used or unused only when it carries `usageKnown: true` and an
`observationDays` window. That flag means the platform itself recorded use of the grant (or of
the identity as a whole) over the window. Silence is never read as "unused". Grants without a
usage record are listed in `usage-not-observable` and judged by nothing.

Every finding's evidence starts with the source files and states the window. Every
`remediation` starts with
`DRAFT. A human reviews and runs this. Validate against the target environment first.`

## The rules

| Rule | Fires when | Severity | Draft |
|:---|:---|:---|:---|
| `dormant-privileged-identity` | The identity's own last use is on record (`lastUsedAt` present, `null` meaning none), it holds at least one usage-recorded grant, nothing was used inside the shortest window, and at least one of those grants is `write` or `admin` | `critical` when the source records no owner (`owner: null`); `high` when there is an owner or the source doesn't carry owners | Remove the unused `write`/`admin` grants |
| `unused-grant` | A usage-recorded `read`, `write` or `admin` grant wasn't used inside its own window. Quiet when the identity already has a dormant finding | `high`; `medium` for `read` | Remove that grant |
| `narrower-permission-available` | The grant is in the versioned narrower-permission table in `src/rules.ts` (seeded with GitHub `administration` → `repository_creation`), which reads the grant list, not usage. Or an imported Okta `.manage` grant was in the app's tokens with no write it covers in the System Log (see Okta below) | `medium` | Swap for the narrower permission; for Okta, grant the `.read` scope, then revoke the `.manage` one |
| `usage-not-observable` | A `write`/`admin` grant has no usage record, or is an AWS wildcard. One finding per identity, each grant listed with the reason | `info` | None; nothing was judged |

An AWS grant whose permission contains `*` is never judged, even with `usageKnown: true`:
last-accessed data leaves out data-plane actions, so narrowing a wildcard from it would break a
working role.

## What the importers record

### AWS (`src/aws.ts`)

| Input | What it becomes |
|:---|:---|
| `aws accessanalyzer get-analyzer` | The window: `unusedAccessAge` becomes every imported grant's `observationDays`. Required whenever findings are given. |
| `get-finding-v2`, `UnusedPermission` | One grant per unused action, `usageKnown: true`, `lastUsedAt` the action's `lastAccessed` or `null`. A service with no action list becomes `<service>:*` with `access: other`. |
| `get-finding-v2`, `UnusedIAMRole` | The role's `lastUsedAt` (its `lastAccessed`, or `null`). |
| `get-finding-recommendation` | The analyzer's recommended policy, kept in `x["scope-drift-trimmer"].awsRecommendations`. It replaces the statement diff in that role's drafts. |
| `get-service-last-accessed-details` (ACTION_LEVEL) | Each tracked action as a grant; each service as `<service>:*` with `access: other`; the role's `lastUsedAt` as the latest `LastAuthenticated`. The 90-day default window applies when no analyzer file is given. |

`iam:PassRole` and common data-plane actions (S3 object, DynamoDB item, Lambda invoke, SQS,
SNS, Kinesis and Firehose records, CloudWatch Logs events) are always `usageKnown: false`.
Only roles are imported: IAM users can be people, and human identities are out of scope. Only
`ACTIVE` findings and `SUCCEEDED` recommendations count. A truncated or unfinished last-accessed
report is refused, because a missing page could hide a recent use.

A role seen only in an `UnusedPermission` finding has no identity-level record, so its grants
can raise `unused-grant` but the role is never called dormant.

### Entra ID (`src/entra.ts`)

| Input | What it becomes |
|:---|:---|
| `servicePrincipals` with `$expand=owners` | One identity per service principal, except Microsoft's own first-party apps. `owners: []` becomes `owner: null`; no `owners` key leaves the owner unknown. Credentials keep only their key id and dates. |
| `servicePrincipals/{id}/appRoleAssignments` | One grant per application permission, named from the resource's `appRoles`. |
| `oauth2PermissionGrants` | One grant per delegated scope, id `oauth2PermissionGrant/<grant id>/<scope>`. |
| `reports/servicePrincipalSignInActivities` (beta) | The identity's `lastUsedAt`: the latest of the report's sign-in timestamps. |

Entra records sign-ins per app, not per permission. So the window is a fixed 90 days, and:

- an app with a sign-in record and no sign-in inside the window gets every grant
  `usageKnown: true` with `lastUsedAt: null`;
- an app that signed in inside the window gets every grant `usageKnown: false`, and
  `usage-not-observable` says when it last signed in;
- an app missing from the sign-in report gets every grant `usageKnown: false` too. Absence from
  the report is not a record of no use.

The sign-in report needs an Entra ID P1 or P2 licence and is still in beta (checked
2026-11-10). Microsoft notes that during the preview it can count partial sign-ins, which can
only make an app look more used, never less.

### Okta (`src/okta.ts`)

| Input | What it becomes |
|:---|:---|
| `GET /oauth2/v1/clients` | One identity per `application_type: service` app, id `okta:app/<client_id>` (Okta uses the app id as the client id). Other OAuth apps act for people and are skipped. Only the id and name are copied; the client secret is dropped. The Client API carries no owner, so the owner is unknown. |
| `GET /api/v1/apps/{id}/grants` | One grant per `ACTIVE` scope grant, id the Okta grant id the revoke draft uses. `REVOKED` grants are skipped. |
| `GET /api/v1/logs`, 90 days, filtered to the service apps' `actor.id` | The identity's `lastUsedAt` (its latest event in the window, or `null`) and each scope's use. |

Okta keeps 90 days of System Log, so that is every Okta grant's window. Every Management API
call needs an access token that carries the scope, and Okta logs each token it issues
(`app.oauth2.token.grant.access_token`, or `app.oauth2.as.token.grant.access_token` for a custom
authorization server). So:

- an app with no event in the window gets every grant `usageKnown: true` with
  `lastUsedAt: null`, and can be called dormant;
- a scope that no successful token in the window carried is `usageKnown: true` with
  `lastUsedAt: null`, and `unused-grant` can fire;
- a scope a token carried counts as used, with `lastUsedAt` the latest such token;
- a `.manage` scope a token carried, where the System Log shows no write it covers by the app,
  raises `narrower-permission-available`, never `unused-grant`. Okta logs writes but not
  reads, so this reads as read-only use. The draft grants the `.read` scope back first;
- an app whose token events don't record their scopes, or an export with no System Log file,
  gets every grant `usageKnown: false`.

What's inference, and says so in evidence: Okta documents neither the field that lists a
token's scopes (the importer reads `debugContext.debugData.grantedScopes`, and Okta says
`debugData` keys aren't guaranteed stable) nor the field that names the app behind an event
(the importer matches `actor.id` or `actor.alternateId`). The write events that count for each
`.manage` scope are this tool's mapping, versioned in `OKTA_WRITE_EVENTS`:
`okta.users.manage` ← `user.lifecycle.*`, `user.account.*`; `okta.groups.manage` ← `group.*`;
`okta.apps.manage` ← `application.*`. Any other `.manage` scope is never read as read-only.

<p align="right">(<a href="#rules-top">back to top</a>)</p>

---

<p align="center">
  <a href="README.md">← Docs home</a> ·
  <a href="ROADMAP.md">Roadmap →</a>
</p>
