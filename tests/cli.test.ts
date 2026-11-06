import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateInventory } from "../src/schema.ts";
import { fixturePath } from "./helpers.ts";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const blocker = new URL("./fixtures/block-network.mjs", import.meta.url).href;
const dir = mkdtempSync(join(tmpdir(), "sdt-cli-"));

const sdt = (...args: string[]) => spawnSync(process.execPath, ["--import", blocker, cli, ...args], { encoding: "utf8" });

test("the network blocker really blocks", () => {
  const r = spawnSync(process.execPath, ["--import", blocker, "-e", "require('node:net').connect(443, 'example.com')"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /network blocked by test/);
});

test("sdt analyze writes a schema-valid inventory and a summary, with outbound sockets blocked", () => {
  const out = join(dir, "out.json");
  const r = sdt("analyze", fileURLToPath(fixturePath("estate.inventory.json")), "--out", out);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Findings: 1 critical, 3 high, 2 medium, 0 low, 4 info/);
  assert.match(r.stdout, /CRITICAL {2}legacy-invoice-sync: Dormant privileged identity with no owner/);
  assert.equal(validateInventory(JSON.parse(readFileSync(out, "utf8"))), null);
});

test("--fail-on sets the exit code", () => {
  const input = fileURLToPath(fixturePath("estate.inventory.json"));
  assert.equal(sdt("analyze", input, "--fail-on", "critical").status, 1);
  assert.equal(sdt("analyze", fileURLToPath(fixturePath("empty.inventory.json")), "--fail-on", "info").status, 0);
  assert.equal(sdt("analyze", input, "--fail-on", "severe").status, 2);
});

test("an invalid document exits non-zero with the schema path and writes nothing", () => {
  const out = join(dir, "never.json");
  const r = sdt("analyze", fileURLToPath(fixturePath("invalid.inventory.json")), "--out", out);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\/identities\/0\/grants\/0\/access .*#\/\$defs\/grant\/properties\/access\/enum/);
  assert.equal(existsSync(out), false);
});

test("bad usage and a missing file exit 2", () => {
  assert.equal(sdt().status, 2);
  assert.equal(sdt("analyze", join(dir, "missing.json")).status, 2);
  assert.match(sdt("--version").stdout, /^sdt \d+\.\d+\.\d+/);
});
