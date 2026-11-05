# Prior-art check, November 2026

**Checked:** 2026-11-05, by the roadmap routine, two weeks ahead of the decision memo's
2026-11-19 date. **Question:** is there a maintained open-source tool that already joins Entra ID
app permissions and AWS IAM grants to their usage, per identity, and drafts the trim?

"Maintained" here means a push in the last twelve months. Repo activity and star counts are from
the GitHub API on the check date.

## What the spec's Musts need

To count as "already built", a tool has to do all of these:

1. Read both Entra ID app permissions and AWS IAM grants, per non-human identity.
2. Put each grant next to the platform's own usage record, and say how good that record is
   (the `usageKnown` grade).
3. Draft the trim as a platform-shaped change a human runs, without applying it.
4. Work from exported files, offline, with no credential held.

## Tools checked

| Tool | Last push | Stars | Entra | AWS | Usage joined | Drafts the trim | Covers the Musts? |
|:---|:---|---:|:---:|:---:|:---:|:---:|:---|
| [Cloudsplaining](https://github.com/salesforce/cloudsplaining) | 2026-11-04 | 2,258 | No | Yes | No | No | No. Static policy analysis: flags risky actions in IAM policies, never looks at whether they were used. |
| [Parliament](https://github.com/duo-labs/parliament) | 2026-01-07 | 1,128 | No | Yes | No | No | No. An IAM policy linter (syntax, bad resource/action pairs). |
| [Prowler](https://github.com/prowler-cloud/prowler) | 2026-11-05 | 15,176 | Partly | Partly | Partly | No | No. See below. |
| [PMapper](https://github.com/nccgroup/PMapper) | 2024-08-02 | 1,590 | No | Yes | No | No | No. Privilege-escalation graph for AWS. Not maintained by this check's bar. |
| [AzureHound](https://github.com/SpecterOps/AzureHound) | 2026-10-16 | 983 | Yes | No | No | No | No. Collects Entra and Azure objects for BloodHound attack paths; no usage data. |
| [ROADtools](https://github.com/dirkjanm/ROADtools) | 2026-10-22 | 2,756 | Yes | No | No | No | No. Dumps and explores Entra tenant data; no usage join or trim. |
| [Repokid](https://github.com/Netflix/repokid) | 2025-11-24 | 1,146 | No | Yes | Yes | Applies | No. AWS only, uses Access Advisor to remove unused services from roles, and *applies* the change through its own deployment. |
| [policy_sentry](https://github.com/salesforce/policy_sentry) | 2026-11-01 | 2,177 | No | Yes | No | Generates | No. Writes least-privilege policies from a declared intent, not from usage. |
| [Cloud Custodian](https://github.com/cloud-custodian/cloud-custodian) | 2026-11-05 | 6,110 | Partly | Yes | No | Applies | No. A rules engine that queries and acts on live resources; no per-grant usage grade. |
| [Cartography](https://github.com/cartography-cncf/cartography) | 2026-11-05 | 4,173 | Partly | Yes | No | No | No. Pulls assets into Neo4j; you write the queries. |
| [Maester](https://github.com/maester365/maester) | 2026-11-05 | 1,179 | Yes | No | Partly | No | No. Entra-only test framework; its unused-privileged-permission test needs Defender XDR advanced hunting data. |
| [EntraRoleReaper](https://github.com/FrodeHus/EntraRoleReaper) | 2026-02-23 | 34 | Yes | No | Yes | No | No. Compares *user* directory roles with audit-log activity; human identities, not apps. |
| [QAZPT](https://github.com/quarkslab/QAZPT) | 2026-04-29 | 11 | Yes | No | No | No | No. Computes effective Entra permissions and their inheritance; no usage. |

### Prowler, the closest

Prowler is the one maintained project that touches both platforms, so it got a closer look.

- **Entra:** the M365 provider's check
  [`entra_app_registration_no_unused_privileged_permissions`](https://github.com/prowler-cloud/prowler/tree/master/prowler/providers/m365/services/entra/entra_app_registration_no_unused_privileged_permissions)
  takes its usage status from Microsoft Defender for Cloud Apps App Governance. Its metadata says
  it needs App Governance enabled and `ThreatHunting.Read.All`, and reports `MANUAL` when that
  data isn't there. That's a paid add-on most tenants don't have, read live with a credential.
  The remediation is portal click-steps, not a draft change.
- **AWS:** the [IAM checks](https://github.com/prowler-cloud/prowler/tree/master/prowler/providers/aws/services/iam)
  cover unused *user* access keys and console passwords (`iam_user_accesskey_unused`,
  `iam_user_console_access_unused`). The
  [Access Analyzer checks](https://github.com/prowler-cloud/prowler/tree/master/prowler/providers/aws/services/accessanalyzer)
  only test that the analyzer is enabled and has no findings. Nothing joins a role's individual
  grants to last-accessed data.
- **Shape:** pass/fail per check, per provider, against a live account. No per-identity view
  across platforms, no evidence grade, no file-import mode.

### Entra Permissions Management replacements

Microsoft retired Entra Permissions Management on 2025-11-01 (the
[Entra blog announcement](https://techcommunity.microsoft.com/blog/microsoft-entra-blog/-/4400198);
[Directions on Microsoft's summary](https://www.directionsonmicrosoft.com/in-brief/entra-permissions-management-to-be-retired/)).
The replacements on offer are all commercial: Microsoft points customers to Delinea, and keeps
some CIEM features (permissions discovery for high-privileged identities, the permissions creep
index) inside Defender for Cloud. Palo Alto's
[vendor-neutral CIEM pitch](https://www.paloaltonetworks.com/blog/?p=343282) is Prisma Cloud.
Searches for an open-source replacement announced since 2025-11-01 found none.

## Verdict

**No maintained open-source tool covers the Musts.** Each one does a piece (Prowler reads live
Entra usage through a paid add-on, Repokid trims AWS roles by applying the change), but none
joins Entra and AWS grants to usage per identity, grades the evidence, and drafts the trim from
exported files. The build plan's first stop rule doesn't fire; Slice 1 goes ahead.

---

<p align="center">
  <a href="../README.md">← Docs home</a> ·
  <a href="../ROADMAP.md">Roadmap →</a>
</p>
