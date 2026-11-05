# Security Policy

Scope Drift Trimmer reads exports that describe who can do what in your cloud and identity
tenants, and it writes draft changes to those permissions. It is built to read them without
sending anything anywhere and to never apply a change itself, so we take reports about it
seriously.

## Reporting a vulnerability

**Please don't open a public issue for a security vulnerability.**

Report it privately through GitHub:

1. Go to the repository's **Security** tab, then **Report a vulnerability** (GitHub Private
   Vulnerability Reporting).
2. Describe the issue, its impact, and the steps to reproduce it. A proof of concept helps.

We aim to acknowledge a report within a few days and keep you posted while we fix it.
Please give us reasonable time to ship a fix before you disclose it.

## Scope

Scope Drift Trimmer runs entirely on your machine, or entirely in your browser tab for the
demo. There's no hosted service, no account and no telemetry. The surfaces that matter most:

- **A change being applied.** Every remediation is a draft that starts with `DRAFT. A human
  reviews and runs this.` A code path that sends a draft to a platform API, or runs it, is a
  vulnerability.
- **Network.** The CLI and the demo page make no network calls after the page loads. A code
  path that does, including the demo uploading a file you loaded, is in scope.
- **A secret reaching output.** Import adapters drop anything that looks like a secret value;
  credentials appear as fingerprints only. A secret in any output, log line or error message
  is a bug.
- **A wrong "unused" claim.** A grant whose use the platform doesn't record must never be
  reported as unused. Trimming on a false claim breaks working systems, so we treat it as a
  security bug, not a feature request.
- **Hostile input.** Exports are parsed, never evaluated. A malformed or oversized file must
  produce an error, not a crash that leaks file contents or a hang.

### Not vulnerabilities (by design)

- A clean result doesn't mean an identity is least-privileged. The tool judges only grants
  whose use the platform records, and says so for the rest.
- A missing platform or rule is a feature request. Open an issue.

## Supported versions

Scope Drift Trimmer is pre-1.0. Fixes land on the latest `main`.

## Test fixtures

Every tenant id, account id, app name and owner in this repo's tests, examples and demo is
fictional (`example.com` owners, AWS's documentation account `123456789012`). Never commit a
real export, a token, a `.env` file or a local path. A full-history secret scan
(`gitleaks git . --log-opts=--all`) came back clean on 2026-11-05.
