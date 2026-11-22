<a id="docs-top"></a>

<h1 align="center">📚 Scope Drift Trimmer Documentation</h1>

<p align="center">
  <em>What the tool is meant to do, the order it gets built in, and what has shipped so far.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/audience-builders-8B5CF6?style=for-the-badge" alt="Audience: builders">
  <a href="ROADMAP.md"><img src="https://img.shields.io/badge/plan-ROADMAP-2ea44f?style=for-the-badge" alt="Roadmap"></a>
  <a href="../README.md"><img src="https://img.shields.io/badge/↩-repository_root-6B7280?style=for-the-badge" alt="Repository root"></a>
</p>

---

## 🗺️ Planning

| Document | What's inside |
|:---|:---|
| [**🗺️ ROADMAP.md**](ROADMAP.md) | The release gates in build order, and what waits until after the repo goes public. |
| [**📋 CHANGELOG.md**](CHANGELOG.md) | Every change, newest first. Roadmap items show up here the run they're ticked. |

## 📦 Product and decisions

| Section | What's inside |
|:---|:---|
| [**📏 rules.md**](rules.md) | The rule catalog: when each of the four rules fires, and what the AWS, Entra and Okta importers record as used, unused or unknown. |
| [**📦 product/**](product/README.md) | The spec with its Won't list, and the build plan that marks Slices 0 to 3 as the MVP. |
| [**⚖️ ADR-001**](decisions/adr-001-typescript-core-file-import.md) | Why one TypeScript core runs in both the CLI and the browser, and why the MVP imports exported files instead of calling platform APIs. |

## 🔎 Reports

| Report | What's inside |
|:---|:---|
| [**🔎 Prior-art check, 2026-11**](reports/2026-11-prior-art-check.md) | Thirteen open-source IAM and Entra tools checked against the spec's Musts on 2026-11-05. None covers them, so the build plan's first stop rule doesn't fire. |

<p align="right">(<a href="#docs-top">back to top</a>)</p>

---

<p align="center">
  <a href="../README.md">← Repository home</a> ·
  <a href="ROADMAP.md">Next: Roadmap →</a>
</p>
