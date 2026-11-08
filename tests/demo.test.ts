import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateInventory } from "../src/schema.ts";
import { fixture } from "./helpers.ts";

// Every way a page could reach the network fails before the demo's modules load.
const blocked = () => {
  throw new Error("network blocked by test");
};
let calls = 0;
const trap = () => {
  calls++;
  blocked();
};
Object.assign(globalThis, { fetch: trap, XMLHttpRequest: trap, WebSocket: trap, EventSource: trap });

const { buildView, downloadText, SAMPLE, usageLabel } = await import("../site/demo.ts");
const view = buildView(SAMPLE, new Date("2026-11-07T00:00:00Z"));

test("the page's analysis runs with fetch and XMLHttpRequest stubbed to fail", () => {
  assert.ok(view.analysis.findings.length > 0);
  assert.equal(calls, 0);
});

test("the sample is the fictional 16-grant estate", () => {
  assert.equal(view.identities.reduce((n, v) => n + v.grants.length, 0), 16);
  assert.match(SAMPLE.content, /123456789012/);
  assert.doesNotMatch(SAMPLE.content, /@(?!example\.com)[a-z0-9.-]+\.[a-z]+/i);
});

test("the banner names legacy-invoice-sync and its one critical finding on load", () => {
  assert.equal(view.banner?.identity, "legacy-invoice-sync");
  assert.equal(view.banner?.finding.severity, "critical");
  const critical = view.analysis.findings.filter((f) => f.severity === "critical");
  assert.equal(critical.length, 1);
  assert.equal(critical[0].ruleId, "scope-drift-trimmer/dormant-privileged-identity");
  assert.match(critical[0].title, /Mail\.ReadWrite, Mail\.Send/);
});

test("findings sort by severity", () => {
  const order = ["critical", "high", "medium", "low", "info"];
  const ranks = view.analysis.findings.map((f) => order.indexOf(f.severity));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test("every grant is listed with its usageKnown label, and only usage-known grants are called unused", () => {
  for (const v of view.identities) {
    assert.equal(v.grants.length, v.identity.grants?.length ?? 0);
    for (const row of v.grants) {
      assert.match(row.usage, row.grant.usageKnown === true ? /^usageKnown: true/ : /^usageKnown: false/);
      if (row.verdict === "called unused") assert.equal(row.grant.usageKnown, true);
      if (row.grant.usageKnown !== true) assert.equal(row.verdict, "not judged");
    }
  }
  assert.equal(usageLabel({ id: "g", resource: "r", permission: "p" }), "usageKnown: false · the platform records no use of this grant");
});

test("log-shipper-lambda's iam:PassRole appears only in a usage-not-observable finding", () => {
  const shipper = view.identities.find((v) => v.identity.displayName === "log-shipper-lambda")!;
  const passRole = shipper.grants.find((r) => r.grant.permission === "iam:PassRole")!;
  assert.equal(passRole.verdict, "not judged");
  const naming = view.analysis.findings.filter((f) => `${f.title} ${f.evidence}`.includes("iam:PassRole"));
  assert.deepEqual(naming.map((f) => f.ruleId), ["scope-drift-trimmer/usage-not-observable"]);
});

test("Download inventory is a schema-valid v0.1 document", () => {
  const doc = JSON.parse(downloadText(view));
  assert.equal(validateInventory(doc), null);
  assert.equal(doc.producer.name, "scope-drift-trimmer");
  assert.deepEqual(doc.x, JSON.parse(SAMPLE.content).x);
});

test("a visitor's own file is analyzed, and a bad one is refused", () => {
  assert.equal(buildView(fixture("estate.inventory.json")).banner?.identity, "legacy-invoice-sync");
  assert.equal(buildView(fixture("empty.inventory.json")).banner, null);
  assert.throws(() => buildView(fixture("malformed.json")), /not valid JSON/);
  assert.throws(() => buildView(fixture("unknown-version.inventory.json")), /unsupported schemaVersion/);
});

test("the page loads only its own scripts and no module can open a connection", () => {
  const html = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ["site/app.js"]);
  assert.doesNotMatch(html, /\bCNAME\b|\bhref="\/(?!\/)/);
  const modules = ["site/app.ts", "site/demo.ts", "src/engine.ts", "src/inventory.ts", "src/rules.ts", "src/remediation.ts", "src/schema.ts"];
  for (const m of modules) {
    const src = readFileSync(new URL(`../${m}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|import\(\s*["'`]http/, m);
  }
});
