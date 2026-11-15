<h1 align="center">📋 Scope Drift Trimmer Changelog</h1>

<p align="center">
  <em>What changed in Scope Drift Trimmer, newest first.</em>
</p>

<p align="center">
  <a href="ROADMAP.md"><img src="https://img.shields.io/badge/plan-ROADMAP-8B5CF6?style=for-the-badge" alt="Roadmap"></a>
  <a href="README.md"><img src="https://img.shields.io/badge/↩-docs-6B7280?style=for-the-badge" alt="Docs home"></a>
</p>

---

Entries that close a roadmap item carry the roadmap phase in italics.

## Unreleased

**Added**
- CI runs `sdt analyze` on the demo's planted estate and `scripts/check-inventory.ts` on the output: it fails when the vendored schema differs from the published `https://ai-automation-tools.dev/schemas/agent-inventory/v0.1.json`, the output doesn't validate, or `legacy-invoice-sync` isn't flagged `critical`. *Public release*
- Build stamp: `site/index.html` carries `<meta name="build" content="__BUILD_SHA__">` for the Pages workflow to fill in. *Public release*
- AWS and Entra ID import: `sdt analyze` takes export files and folders as well as an inventory. `src/aws.ts` reads IAM Access Analyzer unused-access findings, the analyzer (its `unusedAccessAge` is every grant's window), its recommended policies (used as the draft) and action-level last-accessed reports; `iam:PassRole` and data-plane actions are `usageKnown: false`, and only roles are imported. `src/entra.ts` reads service principals with owners, `appRoleAssignments`, `oauth2PermissionGrants` and the beta sign-in activity report; an app that signed in inside the 90-day window, or has no sign-in record, gets its grants marked `usageKnown: false` with the reason in evidence. Both pass the adapter contract test on fictional fixtures and copy only key ids and dates from credentials. `dormant-privileged-identity` now needs the identity's own last use on record and is `critical` only when the source records no owner. The demo loads several export files at once. Export commands and the Entra ID P1/P2 requirement are in the README; the rule catalog is `docs/rules.md`. *Slice 3: AWS and Entra import*
- Demo page in `site/`, built to `_site/` by `npm run build`: it imports the engine and rules from `src/` (no copy), runs them on a fictional 16-grant estate, and names `legacy-invoice-sync` and its `critical` finding on load. Findings sort by severity with the severity written out, each with its evidence and a copy-draft button; every identity lists every grant with its `usageKnown` label and verdict; a visitor's own inventory is analyzed in the browser; "Download inventory" saves a schema-valid v0.1 document. House style with a Light | Dark switch, checked at 390px. `tests/demo.test.ts` runs the page's analysis with `fetch` and `XMLHttpRequest` stubbed to fail. *Slice 2: Demo with the planted problem*
- `sdt analyze <inventory.json> [--out <file>] [--fail-on <severity>]`: reads an agent inventory, validates it against the vendored schema v0.1 (`schemas/agent-inventory.schema.json`), runs `dormant-privileged-identity`, `unused-grant`, `narrower-permission-available` and `usage-not-observable`, and writes the document back with its findings and Entra, AWS, GitHub and Okta draft remediations. Invalid input exits 2 with the schema path of the first error and writes nothing; other producers' identities, findings and `x` data pass through unchanged. The `Adapter` interface ships with the inventory-passthrough adapter and its contract test, and a test runs the CLI with outbound sockets blocked. *Slice 1: Engine and rules*

**Docs**
- README usage checked against the packed build: install from an `npm pack` tarball, `-v` and `-h` in the flag table, both sample runs re-run as installed, and the Won't list now says no secret is held or printed. `*.tgz` is gitignored. *Public release*
- Responsible use section in the README (defensive only, your own or authorized systems, drafts only, fictional demo data), linked from `SECURITY.md`. *Public release*
- Roadmap rechecked against the org's 2026-11 requirements: the intro names the roadmap routine instead of its days; new release items for the Pillar A schema-in-CI gate and the build stamp; the live-demo item stamps the build.
- Roadmap format fix: `## 🧩 Next slices` under `## After public release` is now a `###` group, as the standard requires. No item changed.
- Prior-art check in `docs/reports/2026-11-prior-art-check.md`: thirteen open-source tools, Prowler the closest, none joining Entra and AWS grants to usage per identity with drafted trims. The build plan's first stop rule doesn't fire. *Slice 0: Gate check*

## 2026-11-05

**Added**
- Repo scaffold: a TypeScript CLI (`sdt`) that prints its version, with `npm run build`, `npm test` and `npm run lint` all passing, an MIT licence, and an `.env.example` that says there are no settings.
- CI on push to `main` and on every PR, on Ubuntu and Windows: lint, test and build. *Public release*
- `SECURITY.md` with private reporting through GitHub and what counts as a vulnerability here, including a false "unused" claim. *Public release*
- Demo shell in `site/`: the org source bar, a "coming soon" body, and the app icon (scissors on the shared dark tile, in tan) as its favicon. *Public release*

**Docs**
- Root README, the docs hub, this changelog, and a roadmap that puts Slices 0 to 3 of the build plan above the release line.
- The spec and build plan copied from the private business plan into `docs/product/`, and ADR-001 into `docs/decisions/`. The repo name question in the spec is settled as `scope-drift-trimmer`.
- A full-history secret scan came back clean. *Public release*

---

<p align="center">
  <a href="README.md">← Docs home</a> ·
  <a href="ROADMAP.md">Roadmap →</a>
</p>
