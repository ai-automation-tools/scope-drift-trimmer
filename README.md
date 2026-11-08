<a id="readme-top"></a>

<h1 align="center">✂️ Scope Drift Trimmer</h1>

<p align="center">
  <em>Lists what each service account, bot and agent was granted next to what it used,<br>says how good that usage evidence is, and drafts the trim for you to run.</em>
</p>

<p align="center">
  <a href="docs/README.md"><strong>Explore the docs »</strong></a>
</p>

<p align="center">
  <a href="docs/ROADMAP.md">Roadmap</a>
  ·
  <a href="https://github.com/ai-automation-tools/scope-drift-trimmer/issues">Report Bug</a>
  ·
  <a href="https://github.com/ai-automation-tools/scope-drift-trimmer/issues">Request Feature</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-incubating-F59E0B?style=for-the-badge" alt="Status: incubating">
  <a href="docs/ROADMAP.md"><img src="https://img.shields.io/badge/plan-ROADMAP-8B5CF6?style=for-the-badge" alt="Roadmap"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2ea44f?style=for-the-badge" alt="License: MIT"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-22.18+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 22.18+">
  <img src="https://img.shields.io/badge/platforms-Entra_ID_·_AWS_IAM-0078D4?style=flat-square" alt="Platforms: Entra ID and AWS IAM">
  <img src="https://img.shields.io/badge/changes_applied-zero-6B7280?style=flat-square" alt="Changes applied: zero">
</p>

---

> [!WARNING]
> **Early.** `sdt analyze` reads an agent inventory document and runs all four rules with
> draft fixes, and the demo page in `site/` runs the same engine in a browser (it goes live
> with the Pages workflow). The AWS and Entra importers are still to come, one roadmap item at
> a time. The [roadmap](docs/ROADMAP.md) says what's next.

## 🎯 What it's for

Service principals, IAM roles and bot accounts pick up permissions and rarely give them back.
The platforms do record some usage, but unevenly. AWS knows which management actions a role
called; Entra ID only knows whether an app signed in at all; GitHub knows almost nothing per
permission. A list of "unused permissions" that ignores that difference will tell you to remove
something that is in use.

Scope Drift Trimmer is planned to:

| Step | What it does |
|:---|:---|
| **Import** | Reads files you export yourself: AWS Access Analyzer unused-access findings and last-accessed details, an Entra ID Graph export, or an agent inventory document from another Agent Security Suite tool. |
| **Grade** | Marks every grant `usageKnown: true` only when the platform records its use, and says which data and which window back each claim. |
| **Flag** | Dormant privileged identities (worst when nobody owns them), unused write grants, permissions with a narrower alternative, and grants whose use can't be observed at all. |
| **Draft** | A platform-shaped change per finding: a Graph `DELETE`, an AWS policy diff, a GitHub permission downgrade, an Okta scope revoke. Each starts with `DRAFT.` and goes nowhere until you run it. |

The demo loads a fictional estate (8 identities, 16 grants) and flags `legacy-invoice-sync`, an
app with no owner that holds `Mail.ReadWrite` and `Mail.Send` and hasn't signed in for months,
before you click anything. It lists every grant with its `usageKnown` label, copies drafts,
analyzes a file you load (in the browser, never uploaded) and downloads the result as a
schema-valid inventory. To run it locally, `npm run build` and serve `_site/` with any static
file server; it uses JavaScript modules, so opening the file directly won't work.

### What it won't do

- Apply a change. It drafts; you review and run.
- Call a platform API or hold a credential. It reads exported files.
- Narrow an AWS wildcard from last-accessed data alone. That data leaves out data-plane
  actions, so the narrowed role would break.
- Cover human identities or GCP, or run as a hosted service with accounts or telemetry.

## 🚀 Quick start

From a clone, with Node 22.18 or newer:

```bash
npm install          # dev dependencies only; there are no runtime dependencies
npm run build        # compiles src/ to dist/
node dist/src/cli.js analyze tests/fixtures/estate.inventory.json --out inventory.json
```

The fixture is a fictional estate written by another suite tool. The run prints a summary,
most severe first, and writes the same document back with `scope-drift-trimmer/*` findings
added; the other tool's identities, findings and `x` data come through unchanged.

```text
sdt 0.0.0: estate.inventory.json, 8 identities, 15 grants, as of 2026-11-01T00:00:00Z
Findings: 1 critical, 3 high, 2 medium, 0 low, 4 info
  CRITICAL  legacy-invoice-sync: Dormant privileged identity with no owner: legacy-invoice-sync has not been used in 90 days and holds Mail.ReadWrite, Mail.Send
  ...
```

### Usage

```text
sdt analyze <inventory.json> [--out <file>] [--fail-on <severity>]
sdt --version
```

| Flag | What it does |
|:---|:---|
| `--out <file>` | Writes the inventory with this run's findings. Nothing is written when the input is invalid. |
| `--fail-on <severity>` | Exits 1 when a finding is at or above `critical`, `high`, `medium`, `low` or `info`. For CI. |

Exit codes: `0` ran clean, `1` the `--fail-on` threshold was reached, `2` bad usage or an
input that isn't a valid [schema v0.1](schemas/agent-inventory.schema.json) inventory (the
message names the first error's document path and schema path). Re-running on its own output
replaces its earlier findings and keeps any status a reviewer set, such as `accepted-risk`.

### The rules

| Rule | Fires when | Severity |
|:---|:---|:---|
| `dormant-privileged-identity` | The platform records the identity's use, nothing was used in the window, and it holds a `write`/`admin` grant | `critical` with no owner, else `high` |
| `unused-grant` | A grant whose use is recorded (`usageKnown: true`) wasn't used in its window. Quiet when the identity is already dormant | `high`, `medium` for `read` |
| `narrower-permission-available` | A grant is in the versioned narrower-permission table (GitHub `administration` → `repository_creation`) | `medium` |
| `usage-not-observable` | `write`/`admin` grants whose use the platform doesn't record, such as `iam:PassRole`. They are listed, not judged | `info` |

No rule calls a grant unused unless the platform recorded its use over a stated window, and an
AWS wildcard is never judged from last-accessed data. Every finding's evidence names the data,
the window and the source file, and every draft starts with `DRAFT. A human reviews and runs
this. Validate against the target environment first.`

## 🗂️ What's in here

| Folder | What's inside |
|:---|:---|
| [**📚 docs/**](docs/README.md) | The roadmap, the changelog, the spec and build plan, and ADR-001. |
| [**🧩 src/**](src/) | The `sdt` CLI, the engine, the rules and the draft templates. One TypeScript core that the browser demo imports too. |
| [**📐 schemas/**](schemas/) | The Agent Security Suite's agent inventory schema v0.1, vendored. Every read and write is validated against it. |
| [**🧪 tests/**](tests/) | `node:test` suites, run with `npm test`. |
| [**🖥️ site/**](site/) | The demo page: `index.html`, the fictional `sample.inventory.json`, and `demo.ts`/`app.ts`, which import the engine from `src/`. `npm run build` writes it to `_site/`. |

## 🛠️ Development

```bash
npm run lint    # ESLint plus tsc --noEmit
npm test        # node --test
npm run build   # tsc to dist/, and the demo to _site/
```

Agents working this repo read [AGENTS.md](AGENTS.md) first. Security reports go through
[SECURITY.md](SECURITY.md), not public issues.

---

<p align="center">
  Built with <a href="https://www.typescriptlang.org/">TypeScript</a> · <a href="docs/README.md">Docs</a> · <a href="LICENSE">MIT License</a> · part of <a href="https://github.com/ai-automation-tools">ai-automation-tools</a>
</p>
