# Spec: Scope Drift Trimmer MVP

> Copied from the scope-drift-trimmer business plan (`Analysis/scope-drift-trimmer/build/spec.md` in the private pipeline workspace) on 2026-11-05. Links into the private research, analysis and models are kept as plain text. This copy is the one the roadmap works from.

**Decision it serves:** 2026-11-05 memo · **Status:** draft
**The bet being tested:** practitioners who try it get at least one finding their own console didn't give them (`actionable` ≥25%), and enough of them see it (reach ≈0.5%) `[est: models/roi.py]`.

**MVP = three features** (engine and rules, the Pages demo, two import adapters), built in Slices 1 to 3 of [build-plan.md](build-plan.md). The repo goes public when Slice 3 is done.

## Users & jobs

| User | Job | Basis |
|:---|:---|:---|
| Platform or security engineer who owns NHIs on 2+ platforms | Prepare a quarterly access review with evidence | `[assum]`, market-scan.md JTBD 1 |
| Incident responder | See every grant one identity holds, on every platform, in one view | `[assum]`, JTBD 2 |
| Former Entra Permissions Management customer | Keep the Entra app-permission review going without a paid CIEM | `[fact, B]` that the product retired; the job is `[assum]`, JTBD 3 |
| GhostGrant and MCPFrisk (tools) | Read this tool's findings from the shared inventory file | Suite design, Agent Security Suite |

## The inventory contract

Input and output are the suite's agent inventory schema v0.1, vendored into the repo and validated on every read and write.

- **Identities:** `id` as `<platform>:<native id>` (`azure-entra:sp/<objectId>`, `aws:arn:aws:iam::123456789012:role/<name>`). `lastUsedAt` from the platform's identity-level signal.
- **Grants:** every grant carries `id`, `resource`, `permission`, `access`, `grantedAt` where known, `lastUsedAt`, **`usageKnown`** and **`observationDays`**. `usageKnown` is `true` only when the source platform records use of that grant (or the identity as a whole) over the window. It is never inferred from silence.
- **Findings:** `ruleId` `scope-drift-trimmer/<rule>`, `severity`, `title`, `evidence` (what data, which window, which source file), `remediation` (a draft), `status: open`.
- **`producer`:** `{ name: "scope-drift-trimmer", version }`. Other producers' findings and any `x` data in an input document are kept unchanged on write.

## In scope (this version)

### Must

- **Read and write the inventory format.** As a reviewer, I want to point the tool at an inventory another suite tool wrote, so that its grants get analyzed without re-export.
  - AC: Given a valid v0.1 document from another producer, When the tool runs, Then the output validates against the schema, contains every input identity, grant, finding and `x` key unchanged, and adds only `scope-drift-trimmer/*` findings.
  - AC: Given an invalid document, When the tool runs, Then it exits non-zero with the schema path of the first error and writes nothing.
- **Adapters behind one interface.** As a contributor, I want each platform's importer to be one module behind a shared `Adapter` interface (`parse(files) -> identities[]`), so that a new platform is one file plus fixtures. MVP implementations: inventory passthrough, AWS import, Entra import.
  - AC: Given the three adapters, When the test suite runs, Then each passes the same contract test (valid schema output, stable ids across two runs on the same input, no field outside the schema except under `x`).
- **Four rules, graded by evidence.** As a reviewer, I want each finding to say how strong its evidence is, so that I trust the strong ones and check the weak ones.
  - `dormant-privileged-identity`: identity-level usage known, no use inside the window, holds at least one `write`/`admin` grant. Severity `high`; `critical` when `owner` is null.
  - `unused-grant`: `usageKnown: true`, `access` `write`/`admin`, no use inside the window. Severity `high` (`medium` for `read`). Not raised when the identity already has a dormant finding (one finding, not twenty).
  - `narrower-permission-available`: a static, versioned data table of sensitive permissions with narrower alternatives (seeded with GitHub repository administration → `repository_creation`, per the 2026-10-13 changelog `[fact, B]`). Severity `medium`. Evidence states that usage is unknown.
  - `usage-not-observable`: `info`, one per identity, listing `write`/`admin` grants whose use the platform doesn't record (AWS `iam:PassRole` and data-plane actions, GitHub App permissions). States that these were not judged.
  - AC: Given the demo sample, When it runs, Then `legacy-invoice-sync` gets exactly one `critical` `dormant-privileged-identity` finding naming `Mail.ReadWrite` and `Mail.Send`, and `log-shipper-lambda`'s `iam:PassRole` appears only in a `usage-not-observable` finding.
  - AC: Given a grant with `usageKnown: false`, When rules run, Then no rule claims it is unused.
- **Draft remediation, never applied.** As a reviewer, I want a platform-shaped draft change per finding, so that I can review it and run it myself.
  - Entra: Graph `DELETE /v1.0/servicePrincipals/{resource-sp-id}/appRoleAssignedTo/{assignment-id}` (application) or `DELETE /v1.0/oauth2PermissionGrants/{id}` (delegated).
  - AWS: Access Analyzer's own recommended policy when the import carries one; otherwise a statement diff removing only the unused management actions, with a fixed warning that data-plane actions are not in last-accessed data.
  - GitHub: before/after permission block plus "the installation must be re-approved".
  - Okta: the scope-grant revoke for the service app, and the `.read` scope to add back if one was observed.
  - AC: Every `remediation` string starts with `DRAFT. A human reviews and runs this. Validate against the target environment first.` The tool has no code path that sends it anywhere.
- **CLI.** `sdt analyze <inventory.json | export files...> --out inventory.json` plus a text summary; `--fail-on <severity>` sets the exit code for CI.
  - AC: The CLI makes no network connection; a CI test runs it with outbound sockets blocked.
- **Pages demo with a planted problem.** As a visitor, I want to see the tool catch something before I install anything.
  - AC: Given a first visit, When the page loads, Then the banner names `legacy-invoice-sync` and its finding without any click, findings sort by severity, and every grant (passing ones too) is visible with its `usageKnown` label.
  - AC: A visitor can load their own inventory or export file; it is parsed in the browser and never uploaded (no network request after page load, checked in CI).
  - AC: "Download inventory" saves a schema-valid v0.1 document.
- **AWS import adapter.** Reads Access Analyzer unused-access findings JSON and `GetServiceLastAccessedDetails` output that the user exported with documented AWS CLI commands (listed in the README).
  - AC: Given fixture exports, Then unused actions become `usageKnown: true` grants, `iam:PassRole` and data-plane actions become `usageKnown: false`, and `observationDays` equals the analyzer's usage window.
- **Entra import adapter.** Reads a Graph export (service principals, `appRoleAssignments`, `oauth2PermissionGrants`, `servicePrincipalSignInActivity`) produced by a documented PowerShell or Graph CLI snippet.
  - AC: Given fixture exports, Then the identity's `lastUsedAt` is the latest of the sign-in timestamps, each grant is `usageKnown: true` only when the identity never signed in inside the window, and an app that signed in gets its grants marked `usageKnown: false` with the reason in evidence.

### Should (post-release)

- Okta import (service apps, granted scopes, 90-day System Log events), with event-to-scope mapping marked as inference.
- GitHub import (installations and permissions; API-request audit events when the org has them).
- Access-review CSV export.

### Could

- Read-only live fetch for one platform, with the token read from the environment and never written.
- Prowler-compatible or SARIF output.

## Explicitly out of scope (Won't, this version)

- **Applying any change.** Suite rule 3: drafts only.
- **Live API calls in the MVP.** File import keeps the tool free of credentials; live mode is a later, per-platform decision.
- **Holding or printing any secret.** Credentials appear as fingerprints only; import adapters drop any field that looks like a secret value.
- **A paid tier, accounts, telemetry.**
- **Human identities and role mining.** NHIs only; this is not an IGA tool.
- **Narrowing AWS wildcards from last-accessed data alone.** It would break data-plane access; see aws-last-accessed-limits.md.
- **GCP.** The platform's own recommender covers it; revisit if users ask.

## Non-functional requirements

- **Offline:** CLI and demo make no network calls after load (CI-tested).
- **Scale:** 5,000 identities × 50 grants analyzed in under 5 s on a laptop `[assum: covers a large estate; no measured NHI-per-estate count is used, since the two sources disagree 8x]`.
- **Platforms:** Node 20+ on Windows and Linux; the demo in current Chrome, Firefox, Safari and Edge; mobile-readable (house style).
- **Sample data:** fictional only. `example.com` owners, AWS's documentation account id `123456789012`, made-up tenant and app ids. One planted problem (`legacy-invoice-sync`) plus the honest non-flag (`iam:PassRole`).
- **Accessibility:** findings table keyboard-navigable, severity shown in text as well as colour.

## Mike's approval notes

Mike picked this plan himself on 2026-11-05 and approved incubation in advance, so it has no
`Plan approval` issue and no approval comments to apply. Nothing in this spec was changed at
incubation beyond the repo name below.

## Open questions

| Question | Owner | By |
|:---|:---|:---|
| ~~Exact Okta scope-grant revoke endpoint for service apps~~ Verified 2026-11-05 from Okta's Management API reference: `DELETE /api/v1/apps/{appId}/grants/{grantId}` (scope `okta.appGrants.manage`); cited in `src/remediation.ts`. | Slice 1 run, from Okta docs | Done |
| Does `servicePrincipalSignInActivity` need Entra ID P1/P2? | Slice 3 run, from Microsoft docs | Slice 3; a "yes" is fine, a "removed from beta" triggers the memo's falsifier |
| ~~Repo name: `scope-drift-trimmer` or shorter~~ Settled at incubation (2026-11-05): `ai-automation-tools/scope-drift-trimmer`, CLI `sdt`. Mike can still rename it before graduation. | Mike | Done |

---

<p align="center">
  <a href="README.md">← Product</a> ·
  <a href="build-plan.md">Next: Build plan →</a>
</p>
