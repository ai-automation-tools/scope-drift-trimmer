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
  <a href="https://ai-automation-tools.dev/scope-drift-trimmer/"><img src="https://img.shields.io/badge/demo-live-2ea44f?style=for-the-badge" alt="Live Demo"></a>
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
> **Early.** `sdt analyze` reads an agent inventory document or AWS and Entra ID export files
> and runs all four rules with draft fixes, and the demo page in `site/` runs the same engine
> in a browser, [live here](https://ai-automation-tools.dev/scope-drift-trimmer/). It isn't on npm yet. The
> [roadmap](docs/ROADMAP.md) says what's left before release.

## 🎯 What it's for

Service principals, IAM roles and bot accounts pick up permissions and rarely give them back.
The platforms do record some usage, but unevenly. AWS knows which management actions a role
called; Entra ID only knows whether an app signed in at all; GitHub knows almost nothing per
permission. A list of "unused permissions" that ignores that difference will tell you to remove
something that is in use.

Scope Drift Trimmer works in four steps:

| Step | What it does |
|:---|:---|
| **Import** | Reads files you export yourself: AWS Access Analyzer unused-access findings and last-accessed details, an Entra ID Graph export, or an agent inventory document from another Agent Security Suite tool. |
| **Grade** | Marks every grant `usageKnown: true` only when the platform records its use, and says which data and which window back each claim. |
| **Flag** | Dormant privileged identities (worst when nobody owns them), unused write grants, permissions with a narrower alternative, and grants whose use can't be observed at all. |
| **Draft** | A platform-shaped change per finding: a Graph `DELETE`, an AWS policy diff, a GitHub permission downgrade, an Okta scope revoke. Each starts with `DRAFT.` and goes nowhere until you run it. |

The demo loads a fictional estate (8 identities, 16 grants) and flags `legacy-invoice-sync`, an
app with no owner that holds `Mail.ReadWrite` and `Mail.Send` and hasn't signed in for months,
before you click anything. It lists every grant with its `usageKnown` label, copies drafts,
analyzes an inventory or a set of export files you load (in the browser, never uploaded) and downloads the result as a
schema-valid inventory. To run it locally, `npm run build` and serve `_site/` with any static
file server; it uses JavaScript modules, so opening the file directly won't work.

### What it won't do

- Apply a change. It drafts; you review and run.
- Call a platform API or hold a credential. It reads exported files, and makes no network call.
- Hold or print a secret. Credentials keep their key id and dates; secret values are dropped.
- Narrow an AWS wildcard from last-accessed data alone. That data leaves out data-plane
  actions, so the narrowed role would break.
- Cover human identities or GCP, or run as a hosted service with accounts or telemetry.

### Responsible use

Scope Drift Trimmer is a defensive tool. Run it only on systems and exports you own or are
authorized to review. It makes no live API calls and never revokes anything itself: every
remediation is a draft that a human reviews and runs. The demo page uses planted, fictional
fixtures only; a file you load into it is analyzed in your browser and never uploaded.

## 🚀 Quick start

It isn't on npm yet, so install `sdt` from a clone, with Node 22.18 or newer:

```bash
npm install          # dev dependencies only; there are no runtime dependencies
npm run build        # compiles src/ to dist/
npm pack             # writes scope-drift-trimmer-0.0.0.tgz
npm install --global ./scope-drift-trimmer-0.0.0.tgz
sdt analyze tests/fixtures/estate.inventory.json --out inventory.json
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

The same command reads export files. On the fictional Entra export in `tests/fixtures/entra/`
(a folder stands for every `.json` file in it):

```bash
sdt analyze tests/fixtures/entra
```

```text
sdt 0.0.0: app-role-assignments.json, oauth2-permission-grants.json, service-principals.json, sign-in-activity.json, 4 identities, 7 grants, as of 2026-11-15T05:31:26.410Z
Findings: 1 critical, 1 high, 0 medium, 0 low, 2 info
  CRITICAL  legacy-invoice-sync: Dormant privileged identity with no owner: legacy-invoice-sync has not been used in 90 days and holds Mail.ReadWrite, Mail.Send
  HIGH      reporting-dashboard: Dormant privileged identity: reporting-dashboard has not been used in 90 days and holds Files.ReadWrite.All
  INFO      hr-directory-reader: Use not observable: 1 write/admin grant on hr-directory-reader could not be judged
  INFO      orphan-webhook: Use not observable: 1 write/admin grant on orphan-webhook could not be judged
```

`hr-directory-reader` signed in on 2026-10-30, inside the window, and Entra records sign-ins per app, not per
permission, so its `User.ReadWrite.All` is listed and not judged. `orphan-webhook` isn't in the
sign-in report at all, which is not the same as never signing in.

### Usage

```text
sdt analyze <inventory.json> [--out <file>] [--fail-on <severity>]
sdt analyze <export files or folders...> [--out <file>] [--fail-on <severity>]
sdt --version
sdt --help
```

| Flag | What it does |
|:---|:---|
| `--out <file>` | Writes the inventory with this run's findings. Nothing is written when the input is invalid. |
| `--fail-on <severity>` | Exits 1 when a finding is at or above `critical`, `high`, `medium`, `low` or `info`. For CI. |
| `--version`, `-v` | Prints `sdt` and its version. |
| `--help`, `-h` | Prints the usage above. |

In a built clone, `node dist/src/cli.js` does the same without installing.
Pass either one inventory or any number of export files, not both. Exports are imported into
a schema v0.1 inventory first, with the run's own time as the end of every window, so analyze
an export the day you take it.

Exit codes: `0` ran clean, `1` the `--fail-on` threshold was reached, `2` bad usage, an input
that isn't a valid [schema v0.1](schemas/agent-inventory.schema.json) inventory (the message
names the first error's document path and schema path), or an export file the tool can't read
(the message names the file). Re-running on its own output replaces its earlier findings and
keeps any status a reviewer set, such as `accepted-risk`.

### Export from AWS

Needs the AWS CLI v2, an IAM Access Analyzer **unused-access** analyzer (a paid feature, priced
per role and user analyzed), and read access to Access Analyzer and IAM. In bash, AWS
CloudShell or WSL:

```bash
ANALYZER_ARN=arn:aws:access-analyzer:us-east-1:123456789012:analyzer/your-unused-access-analyzer
mkdir -p aws-export && cd aws-export
aws accessanalyzer get-analyzer --analyzer-name "${ANALYZER_ARN##*/}" > analyzer.json

# Unused-access findings for roles, and the analyzer's recommended policy for each
IDS=$(aws accessanalyzer list-findings-v2 --analyzer-arn "$ANALYZER_ARN" \
  --filter '{"status":{"eq":["ACTIVE"]},"resourceType":{"eq":["AWS::IAM::Role"]}}' \
  --query 'findings[].id' --output text)
for id in $IDS; do
  aws accessanalyzer get-finding-v2 --analyzer-arn "$ANALYZER_ARN" --id "$id" > "finding-$id.json"
  aws accessanalyzer generate-finding-recommendation --analyzer-arn "$ANALYZER_ARN" --id "$id" 2>/dev/null
done
sleep 30   # recommendations take a few seconds each; unfinished ones are skipped
for id in $IDS; do
  aws accessanalyzer get-finding-recommendation --analyzer-arn "$ANALYZER_ARN" --id "$id" \
    > "recommendation-$id.json" 2>/dev/null || rm -f "recommendation-$id.json"
done

# Last-accessed details per role, at action level, with the role ARN added
for arn in $(aws iam list-roles --query 'Roles[].Arn' --output text); do
  job=$(aws iam generate-service-last-accessed-details --arn "$arn" --granularity ACTION_LEVEL --query JobId --output text)
  while [ "$(aws iam get-service-last-accessed-details --job-id "$job" --query JobStatus --output text)" = IN_PROGRESS ]; do sleep 2; done
  aws iam get-service-last-accessed-details --job-id "$job" --query "merge(@, {Arn: '$arn'})" > "last-accessed-${arn##*/}.json"
done
cd .. && sdt analyze aws-export --out inventory.json
```

The `--query "merge(@, {Arn: ...})"` adds the role ARN, which the last-accessed response only
carries for services the role used. Only roles are imported; IAM users are skipped, because
they can be people. The analyzer's `unusedAccessAge` is the window for every AWS grant.

### Export from Entra ID

Needs the `Microsoft.Graph.Authentication` PowerShell module, `Directory.Read.All` and
`AuditLog.Read.All`, and a role such as Global Reader or Reports Reader. The sign-in report
(`reports/servicePrincipalSignInActivities`) needs an **Entra ID P1 or P2** licence and is
still in Graph beta (checked 2026-11-10). Without it every Entra grant is `usageKnown: false`
and nothing is called unused. In PowerShell 7:

```powershell
Connect-MgGraph -Scopes Directory.Read.All, AuditLog.Read.All -NoWelcome
New-Item -ItemType Directory -Force entra-export | Out-Null
function Save-Graph([string]$Uri, [string]$Name) {
  $n = 0
  while ($Uri) {
    $n++
    $json = Invoke-MgGraphRequest -Method GET -Uri $Uri -OutputType Json
    Set-Content -Path "entra-export/$Name-$n.json" -Value $json -Encoding utf8
    $Uri = ($json | ConvertFrom-Json).'@odata.nextLink'
  }
}
Save-Graph 'https://graph.microsoft.com/v1.0/servicePrincipals?$select=id,appId,displayName,appOwnerOrganizationId,servicePrincipalType,accountEnabled,appRoles,keyCredentials,passwordCredentials&$expand=owners' service-principals
Save-Graph 'https://graph.microsoft.com/v1.0/oauth2PermissionGrants' oauth2-permission-grants
Save-Graph 'https://graph.microsoft.com/beta/reports/servicePrincipalSignInActivities' sign-in-activity
Get-ChildItem entra-export/service-principals-*.json |
  ForEach-Object { (Get-Content $_ -Raw | ConvertFrom-Json).value } |
  Where-Object appOwnerOrganizationId -ne 'f8cdef31-a31e-4b4a-93e4-5f571e91255a' |
  ForEach-Object { Save-Graph "https://graph.microsoft.com/v1.0/servicePrincipals/$($_.id)/appRoleAssignments" "app-role-assignments-$($_.id)" }
sdt analyze entra-export --out inventory.json
```

Each Graph page is saved as it arrived, so nothing is reformatted. Secret values never reach
the output: credentials keep their key id and dates only. The window for Entra grants is a
fixed 90 days.

### The rules

The full catalog, with what each importer records, is in [docs/rules.md](docs/rules.md).

| Rule | Fires when | Severity |
|:---|:---|:---|
| `dormant-privileged-identity` | The platform records the identity's own use, nothing was used in the window, and it holds a `write`/`admin` grant | `critical` when the source records no owner, else `high` |
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
| [**🧩 src/**](src/) | The `sdt` CLI, the engine, the rules, the draft templates and the AWS and Entra importers. One TypeScript core that the browser demo imports too. |
| [**📐 schemas/**](schemas/) | The Agent Security Suite's agent inventory schema v0.1, vendored. Every read and write is validated against it. |
| [**🧪 tests/**](tests/) | `node:test` suites, run with `npm test`, over fictional fixtures, including AWS and Entra exports built from the documented response shapes. |
| [**🖥️ site/**](site/) | The demo page: `index.html`, the fictional `sample.inventory.json`, and `demo.ts`/`app.ts`, which import the engine from `src/`. `npm run build` writes it to `_site/`. |

## 🛠️ Development

```bash
npm run lint    # ESLint plus tsc --noEmit
npm test        # node --test
npm run build   # tsc to dist/, and the demo to _site/
```

CI also runs `sdt analyze` on the demo's planted estate and `scripts/check-inventory.ts` on the
result: the vendored schema has to match the [published one](https://ai-automation-tools.dev/schemas/agent-inventory/v0.1.json),
the output has to validate, and `legacy-invoice-sync` has to be flagged `critical`.

On every push to `main`, `.github/workflows/pages.yml` runs `npm run build`, stamps the page's
`<meta name="build">` with the commit and publishes `_site/` to GitHub Pages.

Agents working this repo read [AGENTS.md](AGENTS.md) first. Security reports go through
[SECURITY.md](SECURITY.md), not public issues.

---

<p align="center">
  Built with <a href="https://www.typescriptlang.org/">TypeScript</a> · <a href="docs/README.md">Docs</a> · <a href="LICENSE">MIT License</a> · part of <a href="https://github.com/ai-automation-tools">ai-automation-tools</a>
</p>
