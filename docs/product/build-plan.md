# Build plan: Scope Drift Trimmer

> Copied from the scope-drift-trimmer business plan (`Analysis/scope-drift-trimmer/build/build-plan.md` in the private pipeline workspace) on 2026-11-05. Links into the private research, analysis and models are kept as plain text. This copy is the one the roadmap works from.

**Spec:** [spec.md](spec.md) · **Architecture:** [adr-001-typescript-core-file-import.md](../decisions/adr-001-typescript-core-file-import.md) · **Estimate:** estimate.md

**MVP = Slices 1 to 3** (three features), with Slice 0 as scaffolding. The repo goes public after Slice 3. Everything after is post-release. Run counts are expected values before the 1.85 multiplier in estimate.py.

## Slice 0 - Prior-art check and walking skeleton (MVP scaffolding, ~1-2 runs)

- **Delivers:** the memo's 2026-11-19 check written up in `docs/` (is there a maintained open-source tool that already joins Entra and AWS grants to usage?); repo scaffold, CI on Windows and Linux, the schema v0.1 vendored with a validation test, an npm package that prints a version, a Pages site that loads an empty findings table.
- **De-risks:** whether the project should exist; the deploy path.
- **Done when:** the check is recorded with its answer, CI is green, Pages loads from the repo.

## Slice 1 - Engine and evidence-graded rules on the inventory format (MVP feature 1, ~6 runs)

- **Delivers:** read and validate a v0.1 inventory; the `Adapter` interface with the inventory-passthrough adapter; the four rules (`dormant-privileged-identity`, `unused-grant`, `narrower-permission-available`, `usage-not-observable`); draft remediation templates for Entra, AWS, GitHub and Okta; the CLI with JSON and text output and `--fail-on`; the no-network test.
- **De-risks:** the schedule owner (rules) and the false-positive risk. Every rule ships with a passing and a failing fixture, and one fixture asserts that no `usageKnown: false` grant is ever called unused.
- **Done when:** the spec's inventory, interface, rules, drafts and CLI ACs pass in CI; output from another producer's sample round-trips with its findings and `x` intact.

## Slice 2 - Pages demo with the planted problem (MVP feature 2, ~2 runs)

- **Delivers:** the static demo on the same engine, house style (web-house-style skill); sample inventory with the 16 fictional grants from the idea prototype re-expressed in the schema; banner naming `legacy-invoice-sync` on first load; identity detail view (all grants, `usageKnown` label each); copy-draft button; load-your-own-file (parsed in the browser); download inventory.
- **De-risks:** discoverability and the charter's demo rule; the demo is the shareable artifact the reach assumption rests on.
- **Done when:** the demo ACs pass, including the no-request-after-load check, and the page reads on a phone.

## Slice 3 - AWS and Entra import, then release (MVP feature 3, ~6 runs)

- **Delivers:** AWS import (Access Analyzer unused-access findings, last-accessed details) and Entra import (service principals, app role assignments, OAuth2 permission grants, sign-in activity), each starting from committed fictional fixtures; the README's export command blocks for both; rule catalog; release notes.
- **De-risks:** the second key input (`actionable`): can real exports produce findings a console didn't? And the memo's Entra falsifier (is sign-in activity available from a standard tenant?).
- **Done when:** adapter ACs pass against fixtures, the README runs end to end on a clean machine, and Mike approves the release gate. **Public release = MVP.**

## Post-release slices (not MVP)

4. Okta import (90-day System Log, inference labelled). 5. GitHub import (installations; API-request events where the org has them). 6. Access-review CSV and a merge command that combines GhostGrant, MCPFrisk and this tool's documents by identity id. 7. Read-only live fetch for one platform. 8. Prowler or SARIF export, only if users ask.

## Definition of done

Acceptance criteria pass including empty inventories, malformed JSON, unknown schema versions and identities with no grants; tests in CI concentrate on the rules and on round-tripping other producers' data; input is treated as hostile (parsed, never evaluated); nothing that looks like a secret value is ever written to output; every remediation carries the DRAFT prefix; deployed, not just merged.

## Cut list (if the estimate runs over)

Could: copy-to-clipboard polish, text-summary colours, the GitHub and Okta draft templates (keep Entra and AWS). Should: the `narrower-permission-available` rule (static data, lowest evidence). Last resort: drop the Entra import and ship AWS plus the demo, which the memo says forces a re-score. Must is defended: the inventory contract, the evidence labels and the planted demo are what make this the suite's analyzer; if they have to go, reopen the spec.

## What we learn, and when we'd stop

The first real test is the public release plus a launch post, around mid-January 2027 `[est]`. Slice 3's adapter work gives an earlier, private signal: if the Entra fixtures built from Microsoft's documented response shapes can't yield a provable finding, the cross-platform claim is in trouble before release. Stop per the memo: if the 2026-11-19 check finds a maintained tool that already does this, if the MVP isn't public by 2027-02-28, or if 90 days after release there are fewer than 15 stars and no outside issue or discussion. In that last case the engine stays as the suite's internal analyzer and the slot moves on.

---

<p align="center">
  <a href="spec.md">← Spec</a> ·
  <a href="README.md">Product</a> ·
  <a href="../ROADMAP.md">Roadmap →</a>
</p>
