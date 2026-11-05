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
> **Nothing works yet.** This is the scaffold. `sdt` prints its version and that's all; the
> engine, the rules, the importers and the demo arrive one roadmap item at a time. The
> [roadmap](docs/ROADMAP.md) says what's next.

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

The demo will load a fictional estate and flag `legacy-invoice-sync`, an app with no owner that
holds `Mail.ReadWrite` and `Mail.Send` and hasn't signed in for months, before you click
anything.

### What it won't do

- Apply a change. It drafts; you review and run.
- Call a platform API or hold a credential. It reads exported files.
- Narrow an AWS wildcard from last-accessed data alone. That data leaves out data-plane
  actions, so the narrowed role would break.
- Cover human identities or GCP, or run as a hosted service with accounts or telemetry.

## 🚀 Quick start

From a clone, with Node 22.18 or newer:

```bash
npm install          # dev dependencies only; no runtime dependencies yet
npm run build        # compiles src/ to dist/
node dist/cli.js     # prints "sdt 0.0.0" for now
```

## 🗂️ What's in here

| Folder | What's inside |
|:---|:---|
| [**📚 docs/**](docs/README.md) | The roadmap, the changelog, the spec and build plan, and ADR-001. |
| [**🧩 src/**](src/) | The `sdt` CLI. One TypeScript core that the browser demo will import too. |
| [**🧪 tests/**](tests/) | `node:test` suites, run with `npm test`. |
| [**🖥️ site/**](site/) | The demo page and its favicon. A "coming soon" shell for now. |

## 🛠️ Development

```bash
npm run lint    # ESLint plus tsc --noEmit
npm test        # node --test
npm run build   # tsc to dist/
```

Agents working this repo read [AGENTS.md](AGENTS.md) first. Security reports go through
[SECURITY.md](SECURITY.md), not public issues.

---

<p align="center">
  Built with <a href="https://www.typescriptlang.org/">TypeScript</a> · <a href="docs/README.md">Docs</a> · <a href="LICENSE">MIT License</a> · part of <a href="https://github.com/ai-automation-tools">ai-automation-tools</a>
</p>
