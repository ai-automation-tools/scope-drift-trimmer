// CI gate: `node scripts/check-inventory.ts <inventory.json>` after `sdt analyze` on the planted
// demo estate. Fails unless the vendored schema matches the published one, the output validates
// against it, and legacy-invoice-sync carries its critical dormant finding. This script fetches
// the published schema; the CLI and the demo never touch the network.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { formatSchemaError, INVENTORY_SCHEMA, validateInventory } from "../src/schema.ts";
import type { Inventory } from "../src/types.ts";

const PUBLISHED = "https://ai-automation-tools.dev/schemas/agent-inventory/v0.1.json";
function fail(message: string): never {
  console.error(`check-inventory: ${message}`);
  process.exit(1);
}

const path = process.argv[2];
if (!path) fail("usage: node scripts/check-inventory.ts <inventory.json>");

const res = await fetch(PUBLISHED);
if (!res.ok) fail(`${PUBLISHED} answered ${res.status}`);
if (!isDeepStrictEqual(await res.json(), INVENTORY_SCHEMA)) {
  fail(`schemas/agent-inventory.schema.json differs from ${PUBLISHED}; re-vendor it`);
}

const doc = JSON.parse(readFileSync(path, "utf8")) as Inventory;
const error = validateInventory(doc);
if (error) fail(`${path} is not a valid schema v0.1 inventory: ${formatSchemaError(error)}`);

const planted = doc.identities.find((i) => i.displayName === "legacy-invoice-sync");
const flagged = doc.findings?.some(
  (f) => f.identityId === planted?.id && f.ruleId === "scope-drift-trimmer/dormant-privileged-identity" && f.severity === "critical",
);
if (!flagged) fail(`${path} has no critical dormant-privileged-identity finding on legacy-invoice-sync`);

console.log(`${path}: valid against ${PUBLISHED}, legacy-invoice-sync flagged critical`);
