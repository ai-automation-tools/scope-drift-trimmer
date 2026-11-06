import { test } from "node:test";
import assert from "node:assert/strict";
import { INVENTORY_SCHEMA, SUPPORTED_KEYWORDS, validateInventory } from "../src/schema.ts";
import { fixture } from "./helpers.ts";

test("the validator supports every keyword the vendored schema uses", () => {
  const unsupported = new Set<string>();
  const walk = (node: unknown, inPropertyMap: boolean) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, false));
    if (typeof node !== "object" || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      if (!inPropertyMap && !SUPPORTED_KEYWORDS.has(key)) unsupported.add(key);
      if (key === "enum" || key === "const" || key === "examples" || key === "required") continue;
      walk(value, key === "properties" || key === "$defs");
    }
  };
  walk(INVENTORY_SCHEMA, false);
  assert.deepEqual([...unsupported], []);
});

test("a valid inventory passes", () => {
  assert.equal(validateInventory(JSON.parse(fixture("estate.inventory.json").content)), null);
});

test("the first error carries its instance path and schema path", () => {
  const err = validateInventory(JSON.parse(fixture("invalid.inventory.json").content));
  assert.deepEqual(err && { instancePath: err.instancePath, schemaPath: err.schemaPath }, {
    instancePath: "/identities/0/grants/0/access",
    schemaPath: "#/$defs/grant/properties/access/enum",
  });
});

test("unknown properties, prototype keys and bad formats are rejected", () => {
  const base = JSON.parse(fixture("empty.inventory.json").content);
  assert.equal(validateInventory({ ...base, extra: 1 })?.message, 'unknown property "extra"');
  for (const key of ["constructor", "__proto__", "toString"]) {
    const doc = JSON.parse(JSON.stringify(base).replace("{", `{"${key}": 1, `));
    assert.equal(validateInventory(doc)?.message, `unknown property "${key}"`);
  }
  assert.match(validateInventory({ ...base, generatedAt: "yesterday" })?.message ?? "", /date-time/);
  assert.equal(validateInventory({ ...base, x: [] })?.instancePath, "/x");
});
