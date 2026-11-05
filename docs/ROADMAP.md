<h1 align="center">🗺️ Roadmap</h1>

<p align="center">
  <em>From a CLI that prints its version to a public Scope Drift Trimmer whose demo catches the ownerless mail app on first load, in the order it has to happen.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/now-slice_1:_engine_and_rules-F59E0B?style=for-the-badge" alt="Now: Slice 1, engine and rules">
  <img src="https://img.shields.io/badge/stage-incubating-2ea44f?style=for-the-badge" alt="Stage: incubating">
  <a href="README.md"><img src="https://img.shields.io/badge/↩-docs_home-6B7280?style=for-the-badge" alt="Back to docs"></a>
</p>

---

The Scope-Drift-Trimmer Weekly Roadmap routine works this file top to bottom every Tuesday,
Thursday and Saturday: it takes the first open item that isn't `🔒 Needs owner` (or up to six
`small` ones), builds it, ticks it and opens a `roadmap/auto-<date>` PR. **Every item above
`## After public release` is a release gate.** Scope Drift Trimmer goes public when all of them
are ticked and Mike says so. Ticking an item adds its line to the [changelog](CHANGELOG.md) and
updates any doc it made stale, in the same commit.

Markers: `- [ ]` open, `- [-]` claimed by a run in progress, `- [x]` done, `- [!]` blocked
(the reason follows on the line). `small` marks docs or config a run can batch, up to six
per PR (untagged means a feature, one per run); `🔒 Needs owner` marks one only Mike can do.

The slices come from [product/build-plan.md](product/build-plan.md), which marks Slices 0 to 3
as the MVP. Slice 0's scaffold and CI shipped with the repo, so what's left of it is the gate
check. Slices 1 to 3 are the three features above the line, and deploying Slice 2's page is the
live-demo item in the release phase. Every slice is tested against fictional fixture exports
this repo owns; no item needs a real tenant, a credential or network access.

## 🧭 Slice 0: Gate check

- [x] `small` **Is this already built?** Write `docs/reports/2026-11-prior-art-check.md`, the decision memo's 2026-11-19 check: is there a maintained open-source tool that already joins Entra ID app permissions and AWS IAM grants to their usage, per identity, and drafts the trim? Look at least at Cloudsplaining, Parliament, Prowler's IAM checks, PMapper, AzureHound/ROADtools and any Entra Permissions Management replacement announced since 2025-11-01. Link each repo or doc, say when it was checked, and end with a one-line verdict. If one already covers the spec's Musts, add a `🔒 Needs owner` item under this one asking whether to stop (the build plan's first stop rule) and build nothing else until Mike answers. Link the report from `docs/README.md`. — done 2026-11-05: `docs/reports/2026-11-prior-art-check.md` checks 13 tools; none covers the Musts (Prowler is closest but needs Defender App Governance for Entra usage and has no per-role AWS usage join), so no stop question

## ⚖️ Slice 1: Engine and rules

- [ ] **Evidence-graded engine on the inventory format** (MVP feature 1). Vendor the Agent Security Suite's agent inventory schema v0.1 to `schemas/agent-inventory.schema.json` and validate every read and write against it; an invalid document exits non-zero with the schema path of the first error and writes nothing. The `Adapter` interface (`parse(files) -> identities[]`) with the inventory-passthrough adapter and a shared contract test (schema-valid output, stable ids across two runs, nothing outside the schema except under `x`). The four rules, `dormant-privileged-identity`, `unused-grant` (suppressed when the identity already has a dormant finding), `narrower-permission-available` (a versioned data table seeded with GitHub repository administration → `repository_creation`) and `usage-not-observable`, each with a firing and a non-firing fixture, plus one fixture proving no `usageKnown: false` grant is ever called unused. Draft remediation templates for Entra, AWS, GitHub and Okta, every one starting `DRAFT. A human reviews and runs this. Validate against the target environment first.`; verify the Okta scope-grant revoke endpoint from Okta's docs before writing its template and cite it in a code comment. `sdt analyze <inventory.json> --out <file>` with a text summary and `--fail-on <severity>`. Another producer's sample round-trips with its identities, findings and `x` keys unchanged. A test runs the CLI with outbound sockets stubbed to throw. Empty inventory, malformed JSON, unknown schema version and an identity with no grants each have a fixture.

## 🖥️ Slice 2: Demo with the planted problem

- [ ] **Static demo page on the same engine** (MVP feature 2). `site/` gets the demo in the org house style (the `web-house-style` skill), importing the engine and rules from the build, no copy of the rule code. The fictional sample inventory holds the 16 grants from the idea prototype in schema v0.1, with `legacy-invoice-sync` (ownerless, never signed in, `Mail.ReadWrite` and `Mail.Send`) and `log-shipper-lambda`'s `iam:PassRole`. On first load, with no click, a banner names `legacy-invoice-sync` and its `critical` finding; findings sort by severity; an identity view lists every grant, passing ones too, with its `usageKnown` label; a copy-draft button; "load your own file" parsed in the browser; "Download inventory" saves a schema-valid document. Severity is shown in text as well as colour and the findings table works from the keyboard. A test loads the page script with `fetch` and `XMLHttpRequest` stubbed to fail and proves analysis still works. `npm run build` writes the page to `_site/`, and it reads on a phone.

## 📥 Slice 3: AWS and Entra import

- [ ] **AWS and Entra import adapters** (MVP feature 3). AWS: reads Access Analyzer unused-access findings JSON and `GetServiceLastAccessedDetails` output; unused actions become `usageKnown: true` grants, `iam:PassRole` and data-plane actions become `usageKnown: false`, `observationDays` equals the analyzer's window, and the analyzer's own recommended policy is used as the draft when present. Entra: reads a Graph export of service principals, `appRoleAssignments`, `oauth2PermissionGrants` and `servicePrincipalSignInActivity`; `lastUsedAt` is the latest sign-in timestamp, grants are `usageKnown: true` only when the app never signed in inside the window, otherwise `usageKnown: false` with the reason in evidence. Both pass the adapter contract test against committed fictional fixtures built from the documented response shapes, and drop any field that looks like a secret value. `sdt analyze` accepts export files as well as an inventory. Check from Microsoft's docs whether `servicePrincipalSignInActivity` needs Entra ID P1/P2 and say so in the README; if it has left beta or been removed, add a `🔒 Needs owner` item under this one (the memo's Entra falsifier). A rule catalog at `docs/rules.md`, linked from `docs/README.md`.

## 🚦 Public release

- [x] `small` **CI.** `.github/workflows/ci.yml` runs `npm ci`, `npm run lint`, `npm test` and `npm run build` on `ubuntu-latest` and `windows-latest`, on push to `main` and on every PR, with `permissions: contents: read`. — done 2026-11-05: shipped with the scaffold
- [x] `small` **Security.** `SECURITY.md` says how to report a vulnerability and what counts as one. — done 2026-11-05: shipped with the scaffold
- [x] `small` **Demo shell.** `site/index.html` with the org source bar across the top and a "coming soon" body, and `site/favicon.svg`, the app icon in the shared dark-tile format. — done 2026-11-05: shipped with the scaffold
- [x] `small` **Secret scan.** `gitleaks git . --log-opts=--all` comes back clean on the full history. — done 2026-11-05: clean on the scaffold commit
- [ ] `small` **README usage matches the code.** Install line, every command and flag, the copy-paste AWS CLI and PowerShell/Graph export commands for both adapters, a sample run on a fixture with its real output, and the spec's Won't list stated plainly (drafts only, no live API calls, no secrets held, no GCP). Each command run against the packed build (`npm pack`, installed in a scratch folder) and behaving as written.
- [ ] `small` **Responsible use.** A README section saying the tool is defensive only: run it on systems and exports you own or are authorized to review; what it never does (no live API calls, no revocation it runs itself (every remediation is a draft a human reviews and runs)); and that the demo uses planted, fictional fixtures only. `SECURITY.md` links to it. (Pillar A release gate, org charter 2026-11-05.)
- [ ] **Live demo at `https://ai-automation-tools.dev/scope-drift-trimmer/`.** An `actions/deploy-pages` workflow builds and publishes `_site/` from `main` (enable Pages for the repo with `gh api` in the same PR), until the publish step moves it to `https://scope-drift-trimmer-demo.ai-automation-tools.dev/`. The page shows the MVP working: `legacy-invoice-sync` flagged on first load, a visitor's own file analyzed in the browser. It keeps the source bar and app-icon favicon from the shell, holds only fictional data, and makes no network call after load. The README hero's Live Demo badge points at it.

## After public release

Nothing below blocks go-live.

## 🧩 Next slices

- [ ] **Slice 4: Okta import.** Service apps, granted scopes and 90 days of System Log events, with the event-to-scope mapping marked as inference in evidence. Fictional fixtures; the Okta draft adds back the `.read` scope when one was observed.
- [ ] **Slice 5: GitHub import.** App installations and their permissions, plus API-request audit events where the org has them; without them every permission is `usageKnown: false`.
- [ ] **Slice 6: access-review CSV and `sdt merge`.** A CSV for quarterly reviews, and a merge command that combines GhostGrant, MCPFrisk and this tool's documents by identity id.
- [ ] **Slice 7: read-only live fetch for one platform.** Token read from the environment or `.env`, never written; only if users ask for it in issues.
- [ ] **Slice 8: Prowler-compatible or SARIF output**, only if users ask.

### 📣 Publish and promote

- [ ] `small` `CONTRIBUTING.md` saying how to run the tests and add a rule or an adapter with its fixtures and the contract test.
- [ ] `npm publish --dry-run` is clean, then tag v0.1 and publish to npm. 🔒 Needs owner
- [ ] Launch post built on the demo ("the ownerless app that can still read and send mail"), sent where IAM and platform-security practitioners read, including former Entra Permissions Management users. 🔒 Needs owner
- [ ] Custom subdomain `scope-drift-trimmer-demo.ai-automation-tools.dev`. 🔒 Needs owner
- [ ] 90 days after the repo goes public, run the build plan's stop test: fewer than 15 stars and no outside issue or discussion means stop post-release work and keep the engine as the suite's internal analyzer. 🔒 Needs owner

### 💰 Revenue

None planned. The spec rules out a paid tier, accounts and telemetry.

---

<p align="center">
  <a href="README.md">← Docs home</a> ·
  <a href="CHANGELOG.md">Changelog →</a>
</p>
