import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../src/engine.ts";
import { DRAFT_PREFIX } from "../src/remediation.ts";
import { fixture } from "./helpers.ts";

const RULES = ["dormant-privileged-identity", "unused-grant", "narrower-permission-available", "usage-not-observable"];
const run = (name: string) => analyze(fixture(name)).findings;

for (const rule of RULES) {
  test(`${rule} fires on its firing fixture`, () => {
    assert.ok(run(`rules/${rule}.fires.json`).some((f) => f.ruleId === `scope-drift-trimmer/${rule}`));
  });
  test(`${rule} stays quiet on its non-firing fixture`, () => {
    assert.ok(!run(`rules/${rule}.quiet.json`).some((f) => f.ruleId === `scope-drift-trimmer/${rule}`));
  });
}

test("no rule calls a usageKnown: false grant unused", () => {
  for (const name of ["usage-unknown.inventory.json", "estate.inventory.json", ...RULES.flatMap((r) => [`rules/${r}.fires.json`, `rules/${r}.quiet.json`])]) {
    const { document, findings } = analyze(fixture(name));
    for (const f of findings) {
      const identity = document.identities.find((i) => i.id === f.identityId)!;
      for (const id of f.unusedGrantIds) {
        const grant = identity.grants!.find((g) => g.id === id)!;
        assert.equal(grant.usageKnown, true, `${name}: ${f.id} calls ${id} unused`);
      }
    }
  }
  const unknown = run("usage-unknown.inventory.json");
  assert.deepEqual(unknown.flatMap((f) => f.unusedGrantIds), []);
  assert.deepEqual([...new Set(unknown.map((f) => f.ruleId))].sort(), [
    "scope-drift-trimmer/narrower-permission-available",
    "scope-drift-trimmer/usage-not-observable",
  ]);
});

test("the planted problem: legacy-invoice-sync gets exactly one critical dormant finding", () => {
  const findings = run("estate.inventory.json");
  const mine = findings.filter((f) => f.identityId === "azure-entra:sp/0f5e2c1a-7b3d-4e8f-9a60-1c2d3e4f5a6b");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].ruleId, "scope-drift-trimmer/dormant-privileged-identity");
  assert.equal(mine[0].severity, "critical");
  assert.match(mine[0].title, /Mail\.ReadWrite, Mail\.Send/);
  assert.equal(findings[0], mine[0], "most severe first");
});

test("iam:PassRole appears only in a usage-not-observable finding", () => {
  const shipper = run("estate.inventory.json").filter((f) => f.identityId.endsWith("role/log-shipper-lambda"));
  assert.deepEqual(shipper.map((f) => f.ruleId), ["scope-drift-trimmer/usage-not-observable"]);
  assert.match(shipper[0].evidence!, /iam:PassRole/);
});

test("the estate raises the expected findings and nothing else", () => {
  const got = run("estate.inventory.json").map((f) => `${f.severity} ${f.id}`).sort();
  assert.deepEqual(got, [
    "critical scope-drift-trimmer/dormant-privileged-identity:azure-entra:sp/0f5e2c1a-7b3d-4e8f-9a60-1c2d3e4f5a6b",
    "high scope-drift-trimmer/dormant-privileged-identity:aws:arn:aws:iam::123456789012:role/old-backup-role",
    "high scope-drift-trimmer/unused-grant:aws:arn:aws:iam::123456789012:role/ci-deploy:iam:CreateUser",
    "high scope-drift-trimmer/unused-grant:okta:app/0oa1exampleapp2:oag1examplegrant3",
    "info scope-drift-trimmer/usage-not-observable:aws:arn:aws:iam::123456789012:role/ci-deploy",
    "info scope-drift-trimmer/usage-not-observable:aws:arn:aws:iam::123456789012:role/log-shipper-lambda",
    "info scope-drift-trimmer/usage-not-observable:azure-entra:sp/6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d",
    "info scope-drift-trimmer/usage-not-observable:github:app/314159",
    "medium scope-drift-trimmer/narrower-permission-available:github:app/314159:administration",
    "medium scope-drift-trimmer/unused-grant:aws:arn:aws:iam::123456789012:role/ci-deploy:ec2:DescribeInstances",
  ]);
});

test("an AWS wildcard is never judged unused, even with usageKnown: true", () => {
  const ci = run("estate.inventory.json").filter((f) => f.identityId.endsWith("role/ci-deploy"));
  assert.ok(!ci.some((f) => f.unusedGrantIds.includes("s3:*")));
  assert.match(ci.find((f) => f.ruleId.endsWith("usage-not-observable"))!.evidence!, /s3:\*/);
});

test("every finding's evidence names its source file and window", () => {
  for (const f of run("estate.inventory.json")) {
    assert.match(f.evidence!, /^Source: estate\.inventory\.json\./, f.id);
    assert.match(f.evidence!, /Window: /, f.id);
  }
});

test("every remediation is a draft, shaped for its platform", () => {
  const findings = run("estate.inventory.json");
  for (const f of findings) if (f.remediation) assert.ok(f.remediation.startsWith(`${DRAFT_PREFIX}\n`), f.id);
  const draft = (suffix: string) => findings.find((f) => f.id.endsWith(suffix))!.remediation!;
  assert.match(draft("sp/0f5e2c1a-7b3d-4e8f-9a60-1c2d3e4f5a6b"), /DELETE https:\/\/graph\.microsoft\.com\/v1\.0\/servicePrincipals\/\{resource-sp-id\}\/appRoleAssignedTo\/Qm9ndXMtYXNzaWdubWVudC0x/);
  assert.match(draft("ci-deploy:iam:CreateUser"), /- {3}"iam:CreateUser",\n.*data-plane/);
  assert.match(draft("github:app/314159:administration"), /Before:\n {2}administration: write\nAfter:\n {2}repository_creation: write\n.*re-approved/);
  assert.match(draft("oag1examplegrant3"), /DELETE https:\/\/\{yourOktaDomain\}\/api\/v1\/apps\/0oa1exampleapp2\/grants\/oag1examplegrant3\n.*okta\.users\.read/);
});

test("control characters in hostile input can't forge draft lines", () => {
  const doc = JSON.parse(fixture("rules/unused-grant.fires.json").content);
  doc.identities[0].grants[0].permission = "iam:CreateUser\nrm -rf /";
  const findings = analyze({ name: "hostile.json", content: JSON.stringify(doc) }).findings;
  for (const f of findings) assert.ok(!/\nrm -rf/.test(f.remediation ?? ""), f.id);
});
