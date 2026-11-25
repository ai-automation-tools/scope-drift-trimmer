# Upstreams

Every external platform, export format, and service Scope Drift Trimmer depends on, what the code
assumes about each, and where to check whether that assumption still holds. The biweekly
**Scope-Drift-Trimmer Upstream Check** routine (`upstream/auto-*` PRs) works from this file. Keep
it current by hand too: a new importer, a new draft template or a new CDN asset is a new row.

The tool itself makes no network call and takes no platform SDK: it reads files a user exports
(ADR-001), so these are formats and CLI/API behaviours the user's export step depends on, not live
calls the code makes. The one network use is CI fetching the published schema.

**Last checked** is filled in by the routine, and only with a date it actually read the
source. `—` means never checked.

## Export formats the importers read

| Upstream | What the code assumes | Code | Check at | Last checked |
|:---|:---|:---|:---|:---|
| **AWS IAM Access Analyzer** (unused access) | `GetFindingV2` unused-access findings, `GetAnalyzer` (its `unusedAccessAge` is every AWS grant's window) and `GetFindingRecommendation` (the recommended policy becomes the draft) response shapes. Roles only; IAM users are skipped | `src/aws.ts`, `tests/fixtures/aws/` | docs.aws.amazon.com/access-analyzer/latest/APIReference/API_GetFindingV2.html ; .../API_GetFindingRecommendation.html ; .../API_GetAnalyzer.html | — |
| **AWS IAM last-accessed details** | `GetServiceLastAccessedDetails` at `ACTION_LEVEL` granularity; the role ARN is added by the README's `--query "merge(@, {Arn: ...})"` because the response carries it only for services the role used. `iam:PassRole` and data-plane actions are never treated as observed | `src/aws.ts`, README export snippet | docs.aws.amazon.com/IAM/latest/APIReference/API_GetServiceLastAccessedDetails.html | — |
| **AWS CLI v2** | The README's export commands: `aws accessanalyzer get-analyzer`, `list-findings-v2`, `get-finding-v2`, `generate-finding-recommendation`, `get-finding-recommendation`, and `aws iam list-roles`, `generate-service-last-accessed-details`, `get-service-last-accessed-details` with `--granularity ACTION_LEVEL` | `README.md` | docs.aws.amazon.com/cli/latest/reference/accessanalyzer/ ; .../reference/iam/ | — |
| **Microsoft Graph: service principals, appRoleAssignments, oauth2PermissionGrants** | v1.0 `servicePrincipals` (with `owners`, `appRoles`, `keyCredentials`, `passwordCredentials`), `appRoleAssignments`, `oauth2PermissionGrants` response shapes; secret values are dropped | `src/entra.ts`, `tests/fixtures/entra/` | learn.microsoft.com/graph/api/resources/serviceprincipal ; .../approleassignment ; .../oauth2permissiongrant | — |
| **Microsoft Graph beta: `servicePrincipalSignInActivity`** | `reports/servicePrincipalSignInActivities` is still in beta (checked 2026-11-10 per the README) and needs an Entra ID P1 or P2 licence. `lastUsedAt` is the latest sign-in; an app that signed in inside the 90-day window gets `usageKnown: false` because Entra records use per app, not per permission. If it leaves beta or is removed, the Entra rules change | `src/entra.ts`, `README.md` | learn.microsoft.com/graph/api/resources/serviceprincipalsigninactivity?view=graph-rest-beta ; learn.microsoft.com/entra/identity/monitoring-health/concept-usage-insights-report | — |
| **Microsoft Graph delete endpoints** (draft templates) | `DELETE /oauth2PermissionGrants/{id}` and `DELETE /servicePrincipals/{resource-sp-id}/appRoleAssignedTo/{id}` | `src/remediation.ts` | learn.microsoft.com/graph/api/oauth2permissiongrant-delete ; .../serviceprincipal-delete-approleassignedto | — |
| **Okta Client API, app grants and System Log** | `GET /oauth2/v1/clients` (service apps only), `GET /api/v1/apps/{id}/grants`, and `GET /api/v1/logs` with a 90-day window. The importer reads `debugContext.debugData.grantedScopes` and `actor.id` from access-token events, which Okta does not document, so evidence calls what it concludes from them inference; the write-event list `OKTA_WRITE_EVENTS` is versioned | `src/okta.ts`, `tests/fixtures/okta/` | developer.okta.com/docs/api/openapi/okta-oauth/oauth/client/listclients ; .../management/tags/applicationgrants/other/listscopeconsentgrants ; .../systemlog/other/listlogevents ; developer.okta.com/docs/reference/api/event-types/ ; developer.okta.com/docs/reference/system-log-query/ | — |
| **Okta scope grant endpoints** (draft templates) | `DELETE /api/v1/apps/{appId}/grants/{grantId}` revokes a grant and `POST /api/v1/apps/{appId}/grants` with `issuer` and `scopeId` adds one (the `.read` add-back) | `src/remediation.ts` | developer.okta.com/docs/api/openapi/okta-management/management/tag/ApplicationGrants/ | — |
| **GitHub App permissions** (narrower-permission table) | The versioned table maps `administration` to `repository_creation`; GitHub App permissions are `usageKnown: false` | `src/rules.ts`, `src/remediation.ts` | docs.github.com/rest/overview/permissions-required-for-github-apps | — |

## Agent Security Suite format

| Upstream | What the code assumes | Code | Check at | Last checked |
|:---|:---|:---|:---|:---|
| **Agent inventory schema v0.1** | The vendored `schemas/agent-inventory.schema.json` equals the published document; every read and write validates against it; ids are `<platform>:<native id>`; extras go in `x`. CI fails when the copy differs | `schemas/agent-inventory.schema.json`, `scripts/check-inventory.ts` | ai-automation-tools.dev/schemas/agent-inventory/v0.1.json | — |

## Demo page and hosting

| Upstream | What the code assumes | Code | Check at | Last checked |
|:---|:---|:---|:---|:---|
| **Google Fonts** | The demo page requests Inter and JetBrains Mono CSS from `fonts.googleapis.com` and `fonts.gstatic.com` | `site/index.html` | fonts.google.com/specimen/Inter ; fonts.google.com/specimen/JetBrains+Mono | — |
| **Org consent script** (`ai-automation-tools.dev/consent.js`) | Loaded by the page, absent off the public hosts | `site/index.html` | The org landing repo's `consent.js` | — |
| **GitHub Pages** | Pages source is a workflow (`build_type=workflow`); `_site/` is uploaded and deployed; every page path is relative, so it works under a path and on a custom domain | `.github/workflows/pages.yml` | docs.github.com/pages ; github.blog/changelog | — |
| **Cronsole Registry v1** | The template, pack and index shapes, target and parameter-type vocabulary (`select` with `options`) and the gallery URLs `#/t/<id>` and `#/collection/<pack>` that the builder writes and the README links; files are content-addressed, so they stay LF | `scripts/build-registry.ts`, `registry/`, `.github/workflows/publish-registry.yml`, `.github/workflows/registry-drift.yml` | github.com/ai-automation-tools/cronsole: `backend/src/catalog/schema.ts`, `registry-site/README.md` | — |
| **GitHub Actions** | `actions/checkout@v4`, `actions/setup-node@v4` (Node 22, npm cache), `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`; Dependabot raises new versions | `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `.github/workflows/publish-registry.yml`, `.github/workflows/registry-drift.yml` | github.com/actions/checkout/releases ; github.com/actions/setup-node/releases ; github.com/actions/upload-pages-artifact/releases ; github.com/actions/deploy-pages/releases | — |
| **Node.js** | `engines.node: ">=22.18"` (the sources import each other with `.ts` extensions and run with type stripping); CI runs Node 22 on Ubuntu and Windows | `package.json`, `.github/workflows/ci.yml` | nodejs.org/en/about/previous-releases | — |

## Toolchain majors

Majors only: a patch or minor bump is Dependabot's job and never makes this table wrong. The
exact ranges are in `package.json`. *Latest* is the npm registry's on the *Last checked* date.

| Upstream | Major in `package.json` | Latest | Check at | Last checked |
|:---|:---|:---|:---|:---|
| TypeScript | 6.0 (`~`, minor pinned) | — | devblogs.microsoft.com/typescript | — |
| ESLint, @eslint/js | 9 | — | eslint.org/blog | — |
| typescript-eslint | 8 | — | github.com/typescript-eslint/typescript-eslint/releases | — |
| @types/node | 22 | — | npmjs.com/package/@types/node | — |

Flag breaking majors, EOL runtimes, and security advisories only. Routine bumps are
Dependabot's job.
