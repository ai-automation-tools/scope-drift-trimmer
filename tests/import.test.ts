import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { analyze } from "../src/engine.ts";
import { InventoryError } from "../src/inventory.ts";
import { validateInventory } from "../src/schema.ts";
import type { Grant, InputFile } from "../src/types.ts";
import { fixture, fixturePath } from "./helpers.ts";

const NOW = new Date("2026-11-05T00:00:00Z");
const folder = (dir: string) => readdirSync(fixturePath(`${dir}/`)).sort().map((n) => fixture(`${dir}/${n}`));
const run = (files: InputFile[]) => analyze(files, { now: NOW });
const aws = run(folder("aws"));
const entra = run(folder("entra"));
const identity = (r: typeof aws, name: string) => r.document.identities.find((i) => i.displayName === name)!;
const grant = (r: typeof aws, name: string, permission: string) => identity(r, name).grants!.find((g) => g.permission === permission)!;
const findingsOf = (r: typeof aws, name: string) => r.findings.filter((f) => f.identityId === identity(r, name).id);

test("imports produce a schema-valid inventory with this tool's x data", () => {
  for (const r of [aws, entra]) {
    assert.equal(validateInventory(r.document), null);
    assert.ok(r.findings.length > 0);
  }
  assert.deepEqual(Object.keys(aws.document.x!), ["scope-drift-trimmer"]);
});

test("AWS: unused actions are usageKnown true over the analyzer's window", () => {
  for (const p of ["iam:CreateUser", "iam:AttachRolePolicy"]) {
    const g = grant(aws, "ci-deploy", p);
    assert.equal(g.usageKnown, true, p);
    assert.equal(g.observationDays, 90, p);
  }
  assert.equal(grant(aws, "ci-deploy", "iam:CreateUser").lastUsedAt, null);
  assert.equal(grant(aws, "ci-deploy", "iam:AttachRolePolicy").lastUsedAt, "2026-05-01T10:00:00.000Z");

  const files = folder("aws").map((f) => (f.name === "analyzer.json" ? { ...f, content: f.content.replace('"unusedAccessAge": 90', '"unusedAccessAge": 30') } : f));
  const short = run(files);
  assert.ok(short.document.identities.flatMap((i) => i.grants!).filter((g) => g.usageKnown).every((g) => g.observationDays === 30));
});

test("AWS: iam:PassRole and data-plane actions are usageKnown false and only in usage-not-observable", () => {
  const passRole = grant(aws, "ci-deploy", "iam:PassRole");
  const putObject = grant(aws, "reports-reader", "s3:PutObject");
  for (const g of [passRole, putObject]) assert.equal(g.usageKnown, false, g.permission);
  for (const f of aws.findings) {
    const mentions = f.evidence!.includes("iam:PassRole") || f.evidence!.includes("s3:PutObject");
    if (mentions) assert.equal(f.ruleId, "scope-drift-trimmer/usage-not-observable", f.id);
  }
  assert.match(findingsOf(aws, "ci-deploy").find((f) => f.ruleId.endsWith("usage-not-observable"))!.evidence!, /IAM records no use of iam:PassRole/);
});

test("AWS: the analyzer's recommended policy is the draft when present", () => {
  const ci = findingsOf(aws, "ci-deploy").find((f) => f.id.endsWith(":iam:CreateUser"))!;
  assert.match(ci.remediation!, /^DRAFT\. /);
  assert.match(ci.remediation!, /CREATE_POLICY arn:aws:iam::123456789012:policy\/ci-deploy-policy: replace it with this policy/);
  assert.match(ci.remediation!, /"cloudformation:UpdateStack",/);
  const other = findingsOf(aws, "reports-reader").find((f) => f.ruleId.endsWith("unused-grant"))!;
  assert.match(other.remediation!, /- {3}"athena:StartQueryExecution",/, "no recommendation: the statement diff");
});

test("AWS: roles only, active findings only, and identity-level use is never inferred", () => {
  const names = aws.document.identities.map((i) => i.displayName).sort();
  assert.deepEqual(names, ["ci-deploy", "old-backup-role", "reports-reader"], "the IAM user and the archived finding are skipped");
  assert.equal(identity(aws, "ci-deploy").lastUsedAt, "2026-11-01T18:00:00.000Z");
  // reports-reader has only an unused-permission finding: its grants are judged, the role isn't.
  assert.equal("lastUsedAt" in identity(aws, "reports-reader"), false);
  assert.deepEqual(findingsOf(aws, "reports-reader").map((f) => f.ruleId).sort(), [
    "scope-drift-trimmer/unused-grant",
    "scope-drift-trimmer/usage-not-observable",
  ]);
  const backup = findingsOf(aws, "old-backup-role");
  assert.deepEqual(backup.map((f) => `${f.severity} ${f.ruleId}`), ["high scope-drift-trimmer/dormant-privileged-identity"]);
  assert.match(backup[0].evidence!, /Owner: not in the source data\./);
  assert.match(backup[0].evidence!, /^Source: findings\.json, last-accessed-old-backup-role\.json \(imported\)\. Window: 90 days/);
});

test("AWS: findings without the analyzer, truncated or unfinished reports and a missing ARN are refused", () => {
  const without = folder("aws").filter((f) => f.name !== "analyzer.json");
  assert.throws(() => run(without), /need the analyzer's window/);
  const la = fixture("aws/last-accessed-old-backup-role.json");
  assert.throws(() => run([{ ...la, content: la.content.replace('"IsTruncated": false', '"IsTruncated": true') }]), /truncated/);
  assert.throws(() => run([{ ...la, content: la.content.replace('"COMPLETED"', '"IN_PROGRESS"') }]), /not COMPLETED/);
  const noArn = JSON.parse(la.content);
  delete noArn.Arn;
  for (const s of noArn.ServicesLastAccessed) delete s.LastAuthenticatedEntity;
  assert.throws(() => run([{ name: "x.json", content: JSON.stringify(noArn) }]), /no role ARN/);
});

test("Entra: the planted app gets one critical dormant finding naming Mail.ReadWrite and Mail.Send", () => {
  const mine = findingsOf(entra, "legacy-invoice-sync");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].ruleId, "scope-drift-trimmer/dormant-privileged-identity");
  assert.equal(mine[0].severity, "critical");
  assert.match(mine[0].title, /Mail\.ReadWrite, Mail\.Send/);
  assert.equal(entra.findings[0], mine[0]);
  assert.equal(identity(entra, "legacy-invoice-sync").lastUsedAt, null);
});

test("Entra: lastUsedAt is the latest sign-in timestamp, and offsets like -8:00 are read", () => {
  assert.equal(identity(entra, "reporting-dashboard").lastUsedAt, "2026-01-15T17:00:00.000Z");
  assert.equal(identity(entra, "hr-directory-reader").lastUsedAt, "2026-10-30T12:00:00.000Z");
});

test("Entra: an app that signed in inside the window has its grants usageKnown false, with the reason in evidence", () => {
  assert.equal(grant(entra, "hr-directory-reader", "User.ReadWrite.All").usageKnown, false);
  const [f] = findingsOf(entra, "hr-directory-reader");
  assert.equal(f.ruleId, "scope-drift-trimmer/usage-not-observable");
  assert.match(f.evidence!, /Entra records sign-ins per app, not per permission, and this app last signed in 2026-10-30T12:00:00\.000Z/);
  // No sign-in record at all is unknown too, never "never signed in".
  assert.equal(grant(entra, "orphan-webhook", "Mail.Send").usageKnown, false);
  assert.equal("lastUsedAt" in identity(entra, "orphan-webhook"), false);
  assert.match(findingsOf(entra, "orphan-webhook")[0].evidence!, /no sign-in activity record/);
});

test("Entra: delegated scopes are one grant each, and Microsoft's own service principals are left out", () => {
  const dash = identity(entra, "reporting-dashboard").grants!.map((g: Grant) => g.id);
  assert.deepEqual(dash, ["oauth2PermissionGrant/R3JhbnQtZXhhbXBsZS0x/User.Read", "oauth2PermissionGrant/R3JhbnQtZXhhbXBsZS0x/Files.ReadWrite.All"]);
  assert.match(findingsOf(entra, "reporting-dashboard")[0].remediation!, /DELETE https:\/\/graph\.microsoft\.com\/v1\.0\/oauth2PermissionGrants\/R3JhbnQtZXhhbXBsZS0x$/m);
  assert.equal(entra.document.identities.some((i) => i.displayName === "Microsoft Graph"), false);
});

test("Entra: secret values are dropped; credentials appear by key id only", () => {
  const out = JSON.stringify(entra.document);
  for (const secret of ["fixture-secret-text-not-real", "xQ7", "fixture-public-key-body", "fixture-thumbprint"]) {
    assert.ok(!out.includes(secret), secret);
  }
  assert.deepEqual(identity(entra, "legacy-invoice-sync").credentials, [
    { id: "passwordCredential/5e1f0c2a-3b4d-4e5f-8a6b-7c8d9e0f1a2b", type: "api-key", fingerprint: "5e1f0c2a-3b4d-4e5f-8a6b-7c8d9e0f1a2b", location: "platform", createdAt: "2023-02-14T09:00:00.000Z", expiresAt: "2027-02-14T09:00:00.000Z" },
  ]);
});

test("no rule calls a usageKnown: false grant unused in an import", () => {
  for (const r of [aws, entra]) {
    for (const f of r.findings) {
      const grants = r.document.identities.find((i) => i.id === f.identityId)!.grants!;
      for (const id of f.unusedGrantIds) assert.equal(grants.find((g) => g.id === id)!.usageKnown, true, f.id);
    }
  }
});

test("export files and inventories don't mix, and an unknown file is refused by name", () => {
  const mixed = [fixture("estate.inventory.json"), ...folder("entra")];
  assert.throws(() => run(mixed), (e) => e instanceof InventoryError && /estate\.inventory\.json: not an AWS or Entra export/.test(e.message));
  assert.throws(() => run([...folder("aws"), { name: "notes.json", content: '{"hello": 1}' }]), /notes\.json: not an AWS or Entra export/);
  assert.throws(() => run([...folder("aws"), fixture("malformed.json")]), /malformed\.json: not valid JSON/);
});

test("re-analyzing an imported document keeps its sources and the AWS draft", () => {
  const again = analyze({ name: "out.json", content: JSON.stringify(aws.document) }, { now: NOW });
  assert.deepEqual(again.findings.map((f) => [f.id, f.evidence, f.remediation]), aws.findings.map((f) => [f.id, f.evidence, f.remediation]));
});
