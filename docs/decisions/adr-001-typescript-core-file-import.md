# ADR-001: One TypeScript core for CLI and browser, file-import adapters first

> Copied from the scope-drift-trimmer business plan (`Analysis/scope-drift-trimmer/build/adr-001-typescript-core-file-import.md` in the private pipeline workspace) on 2026-11-05. Links into the private research, analysis and models are kept as plain text. This copy is the one the roadmap works from.

**Status:** proposed · **Reversibility:** one-way for the language, two-way for live mode
**Serves:** [spec.md](../product/spec.md)

## Context

- The demo has to run the same rules as the CLI, client-side, on GitHub Pages (charter: demo catches something; runs locally first).
- Two sibling suite tools read and write the same inventory file. MCPFrisk's plan already chose a TypeScript shared core for the same browser-plus-CLI reason (mcp-frisk ADR-001).
- Builders are unattended agents working three runs a week; the stack should be one they verify easily with plain `npm test`.
- The tool must not hold platform credentials in its first version.

## Options considered

1. **TypeScript core, compiled for Node (CLI) and the browser (demo); adapters import exported files** (chosen) · cost: $0 recurring (npm, GitHub Pages) `[fact: both free for public repos]`.
2. **Python CLI plus a separate JS demo.** Python is the IAM-scripting lingua franca and has first-party SDKs for all four platforms (boto3, msgraph, PyGithub, okta). The strongest case: practitioners already run Python. Rejected because the rules would exist twice and drift, which in a security tool means the demo shows findings the CLI doesn't make. Pyodide in the browser would avoid that at the cost of a ~10 MB demo `[assum]` and slower agent iteration.
3. **TypeScript core with live API adapters from day one.** Better first experience. Rejected for the MVP: four credential models (SigV4, Entra app or delegated tokens, GitHub App JWT, Okta OAuth service app), each a security surface, before the evidence rules are proven. Live mode becomes one adapter capability later, behind the same interface.

## Decision

Option 1. The deciding reason: one rule implementation, tested once, running in both places. File import comes first because it lets the MVP make a strong security claim (the tool never sees a credential) and makes every adapter testable from fixtures with no live tenant.

## Exit cost

Rewriting the core in another language after users exist: the whole repo, roughly the MVP's 27 runs again `[est: models/estimate.py]`. The inventory schema is language-neutral, so other tools and users are unaffected. Adding live mode later is two-way: a new adapter capability, no change to rules or output.

## Cost envelope

$0 per month at launch and at any plausible scale: Pages hosting, npm publishing and GitHub Actions minutes for a public repo are free `[fact: GitHub and npm free tiers for public projects; not re-checked on this run]`. No server, no database. Nothing to feed back into `roi.py`.

## Consequences

- Committed to Node 20+ for the CLI and an ES-module build for the browser.
- The schema is vendored, not fetched; a schema bump is a dependency update with a test.
- Users must export files first. The README carries one copy-paste command block per platform. This is the first-run friction the strongest counterargument names; watch the issue tracker for it.
- First bottleneck: none at MVP scale. The 5,000 × 50 target is an in-memory join.

---

<p align="center">
  <a href="../README.md">← Docs home</a> ·
  <a href="../product/spec.md">Spec →</a>
</p>
