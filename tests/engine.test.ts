import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { analyze, failsAt } from "../src/engine.ts";
import { awsAdapter } from "../src/aws.ts";
import { entraAdapter } from "../src/entra.ts";
import { oktaAdapter } from "../src/okta.ts";
import { inventoryAdapter, InventoryError, type Adapter } from "../src/inventory.ts";
import { validateInventory } from "../src/schema.ts";
import { VERSION } from "../src/version.ts";
import { fixture } from "./helpers.ts";

// The shared adapter contract: every adapter, on its committed fictional fixtures.
const folder = (dir: string) => readdirSync(new URL(`./fixtures/${dir}/`, import.meta.url)).map((n) => `${dir}/${n}`);
const ADAPTERS: [Adapter, string[]][] = [
  [inventoryAdapter, ["estate.inventory.json"]],
  [awsAdapter, folder("aws")],
  [entraAdapter, folder("entra")],
  [oktaAdapter, folder("okta")],
];

for (const [adapter, files] of ADAPTERS) {
  test(`adapter contract: ${adapter.name}`, () => {
    const input = files.map(fixture);
    const first = adapter.parse(input);
    const doc = { schemaVersion: "0.1", generatedAt: "2026-11-01T00:00:00Z", producer: { name: "t", version: "0" }, identities: first };
    assert.equal(validateInventory(doc), null, "schema-valid output, nothing outside the schema");
    assert.ok(first.length > 0);
    assert.deepEqual(adapter.parse(files.map(fixture)).map((i) => i.id), first.map((i) => i.id), "stable ids");
    for (const i of first) assert.match(i.id, new RegExp(`^${i.platform}:.+`), "ids are <platform>:<native id>");
    for (const f of input) assert.equal(adapter.accepts(JSON.parse(f.content)), true, `${adapter.name} reads ${f.name}`);
  });
}

test("another producer's identities, findings and x keys round-trip unchanged", () => {
  const input = JSON.parse(fixture("estate.inventory.json").content);
  const { document } = analyze(fixture("estate.inventory.json"), { now: new Date("2026-11-05T00:00:00Z") });
  assert.equal(validateInventory(document), null);
  assert.deepEqual(document.identities, input.identities);
  assert.deepEqual(document.x, input.x);
  assert.deepEqual(document.findings!.filter((f) => !f.ruleId.startsWith("scope-drift-trimmer/")), input.findings);
  const added = document.findings!.slice(input.findings.length);
  assert.ok(added.length > 0 && added.every((f) => f.ruleId.startsWith("scope-drift-trimmer/")), "adds only its own findings");
  assert.deepEqual(document.producer, { name: "scope-drift-trimmer", version: VERSION });
  assert.equal(document.generatedAt, "2026-11-05T00:00:00.000Z");
});

test("re-running on its own output replaces its findings and keeps a reviewer's status", () => {
  const first = analyze(fixture("estate.inventory.json")).document;
  first.findings!.find((f) => f.ruleId === "scope-drift-trimmer/unused-grant")!.status = "accepted-risk";
  const second = analyze({ name: "out.json", content: JSON.stringify(first) }).document;
  assert.equal(second.findings!.length, first.findings!.length);
  assert.deepEqual(second.findings!.map((f) => [f.id, f.status]), first.findings!.map((f) => [f.id, f.status]));
});

test("an empty inventory and an identity with no grants raise nothing", () => {
  for (const name of ["empty.inventory.json", "no-grants.inventory.json"]) {
    const { document, findings } = analyze(fixture(name));
    assert.deepEqual(findings, []);
    assert.equal(validateInventory(document), null);
  }
});

test("malformed JSON, an unknown schema version and an invalid document are refused", () => {
  assert.throws(() => analyze(fixture("malformed.json")), (e) => e instanceof InventoryError && /not valid JSON/.test(e.message));
  assert.throws(() => analyze(fixture("unknown-version.inventory.json")), (e) => e instanceof InventoryError && /unsupported schemaVersion "0.2"/.test(e.message));
  assert.throws(
    () => analyze(fixture("invalid.inventory.json")),
    (e) => e instanceof InventoryError && e.message.includes("/identities/0/grants/0/access") && e.message.includes("#/$defs/grant/properties/access/enum"),
  );
  assert.throws(() => analyze({ name: "bom.json", content: "﻿[]" }), /must be object/);
});

test("--fail-on thresholds", () => {
  const { findings } = analyze(fixture("estate.inventory.json"));
  assert.equal(failsAt(findings, "critical"), true);
  const quiet = analyze(fixture("rules/usage-not-observable.fires.json")).findings;
  assert.equal(failsAt(quiet, "low"), false);
  assert.equal(failsAt(quiet, "info"), true);
});

test("engine, rule and adapter modules import no Node built-ins (ADR-001)", () => {
  const src = new URL("../src/", import.meta.url);
  for (const name of readdirSync(src).filter((n) => n.endsWith(".ts") && n !== "cli.ts" && n !== "io.ts")) {
    const text = readFileSync(new URL(name, src), "utf8");
    assert.ok(!/from\s+["'](node:|fs|path|http|https|net|child_process)["']/.test(text), name);
    assert.ok(!/\b(fetch|XMLHttpRequest)\s*\(/.test(text), name);
  }
});
