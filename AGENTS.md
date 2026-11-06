# AGENTS.md

Standing orders for the agent that works this repo, usually the Scope-Drift-Trimmer Weekly
Roadmap routine (Tuesday, Thursday and Saturday).

## What scope-drift-trimmer is

An access-review tool for non-human identities: service principals, IAM roles, bots and
agents. `sdt analyze` reads grants that a user exported from Entra ID or AWS IAM (or an
agent inventory document another suite tool wrote), puts each grant next to the platform's
own record of whether it was used, and grades how good that record is. Four rules raise
findings: `dormant-privileged-identity`, `unused-grant`, `narrower-permission-available` and
`usage-not-observable`. Each finding carries a platform-shaped draft remediation (a Graph
`DELETE`, an AWS policy diff, a GitHub permission downgrade, an Okta scope revoke) that a human
reviews and runs. A static demo on GitHub Pages runs the same engine on a fictional estate and
flags the planted ownerless mail app `legacy-invoice-sync` on first load.

The wedge: Microsoft retired Entra Permissions Management on 2025-11-01, AWS only covers its
own half, and nobody else labels a grant's evidence. **Evidence grading is the product.** A
grant is `usageKnown: true` only when the platform records use of that grant (or of the
identity as a whole) over the window. It is never inferred from silence, and no rule ever
calls a `usageKnown: false` grant unused.

**Input and output are the Agent Security Suite's agent inventory format, schema v0.1.** The
schema is vendored at `schemas/agent-inventory.schema.json` (from the org site) and every read and
write is validated against it. Identity ids are `<platform>:<native id>`. Findings use `ruleId`
`scope-drift-trimmer/<rule>` and `producer` `{ name: "scope-drift-trimmer", version }`. Other
producers' identities, findings and `x` data pass through unchanged. Never add a field the
schema doesn't allow; put extras in `x`.

Full spec: `docs/product/spec.md`. Slice order: `docs/product/build-plan.md`. Work queue:
`docs/ROADMAP.md`.

## Stack

- TypeScript 6.0, ESM (`"type": "module"`), Node 22.18 or newer. **npm**, not pnpm or yarn.
  The spec says Node 20+; 22.18 is the floor because tests run `.ts` files directly with
  Node's type stripping, and Node 20 is past end of life. TypeScript is pinned to `~6.0`
  because `typescript-eslint` doesn't support 7.x yet.
- Sources import each other with `.ts` extensions (`import { VERSION } from "./version.ts"`).
  Node strips types at runtime and `tsc` rewrites the extensions on build
  (`rewriteRelativeImportExtensions`). `erasableSyntaxOnly` is on: no enums, no namespaces,
  no parameter properties.
- Tests: `node:test` and `node:assert/strict`, files in `tests/*.test.ts`. Fixtures in
  `tests/fixtures/`. No Jest, no Vitest.
- Lint: ESLint 9 flat config with `typescript-eslint` recommended, plus `tsc --noEmit`.
- CI runs on `ubuntu-latest` and `windows-latest`. Path handling has to work on both.
- `src/cli.ts` is the bin entry (`sdt`) and stays thin. The engine, rules, remediation
  templates and adapters take file **contents** as arguments and must not import Node
  built-ins: the browser demo in `site/` imports them too (ADR-001). File reading lives in a
  separate Node-only module.
- Adapters sit behind one `Adapter` interface (`parse(files) -> identities[]`). A new platform
  is one module plus fixtures, and passes the shared adapter contract test.
- Settings live in `.env` at the repo root, names in `.env.example`; the real environment
  wins. There are none today: the MVP reads exported files and never holds a credential. If
  one is ever needed, load it with Node's `util.parseEnv`. Never tell anyone to set a Windows
  user environment variable.

## Verify

Run all three from the repo root. All three must pass before a PR opens.

```
npm run lint
npm test
npm run build
```

## Architecture decisions that are already made

- **ADR-001: one TypeScript core, file import first**
  (`docs/decisions/adr-001-typescript-core-file-import.md`). The CLI and the demo run
  identical rule code. Don't add a second language, Pyodide or a WASM build.
- **Drafts only.** Every `remediation` string starts with
  `DRAFT. A human reviews and runs this. Validate against the target environment first.`
  There is no code path that sends a draft anywhere or runs it.
- **Zero network.** The CLI and the demo make no network calls after load. A test proves it
  for each (outbound sockets blocked for the CLI; `fetch` and `XMLHttpRequest` stubbed for the
  demo).
- **Input is hostile.** Parse JSON, never evaluate it. Empty inventories, malformed JSON,
  unknown schema versions and identities with no grants each get a fixture.

## Won't (this version)

Carried from the spec. If a roadmap item seems to need one of these, stop and flag it.

- **Applying any change.** Drafts only.
- **Live API calls.** File import keeps the tool free of credentials; live mode is a later,
  per-platform decision.
- **Holding or printing any secret.** Credentials appear as fingerprints only; adapters drop
  any field that looks like a secret value.
- **A paid tier, accounts or telemetry.**
- **Human identities and role mining.** NHIs only; this is not an IGA tool.
- **Narrowing AWS wildcards from last-accessed data alone.** Last-accessed data never
  includes data-plane actions, so it would break working roles.
- **GCP.** Its own recommender covers it.

## Standards

- **Never call unobserved usage "unused".** `iam:PassRole`, AWS data-plane actions and GitHub
  App permissions are `usageKnown: false` and appear only in `usage-not-observable` findings.
  An Entra app that signed in inside the window gets its grants marked `usageKnown: false`
  with the reason in evidence, because Entra records use per app, not per permission.
- **Evidence says what, which window, which source file.** A finding without that is a bug.
- Every rule ships with a fixture that fires it and one that doesn't, and one fixture asserts
  no `usageKnown: false` grant is ever called unused.
- No new runtime dependency without a line in the PR body saying why. A JSON Schema
  validator is a reasonable one; most other things are a few lines of code.
- This repo goes public at graduation. Never commit `.env*`, real exports, real tenant or
  account ids, real personal data, or local paths like `C:\Users\...` or `D:\...`. Sample
  data is fictional: `example.com` owners, AWS's documentation account `123456789012`,
  made-up tenant and app GUIDs.
- Commit messages: plain imperative sentences ("Add the unused-grant rule"), no Conventional
  Commit prefixes.

## What "done" means for a roadmap item

1. The item's own text is true of the code, checked by running it.
2. `npm run lint`, `npm test` and `npm run build` pass, and new behaviour has a test.
3. Anything the change made untrue is fixed: `README.md`, `docs/`, this file.
4. `docs/CHANGELOG.md` has a line for it, tagged with the roadmap phase in italics, in the
   same commit that flips the box to `- [x]` with a dated note.
5. It's on a `roadmap/auto-<date>` branch with a PR into `main`. Never push to `main`.
