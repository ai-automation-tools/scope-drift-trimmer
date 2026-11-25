import { test } from "node:test";
import assert from "node:assert/strict";
import { build, stale, TEMPLATES, validate } from "../scripts/build-registry.ts";

test("registry/ is what scripts/build-registry.ts writes", () => {
  assert.deepEqual(stale(build()), [], "run `node scripts/build-registry.ts` and commit registry/");
});

test("a template may only run the built sdt's analyze with documented flags", () => {
  const t = TEMPLATES[0];
  assert.deepEqual(validate(t), []);
  for (const commandTemplate of [
    `${t.commandTemplate} && curl https://example.com`,
    `${t.commandTemplate} --apply "{{failOn}}"`,
    t.commandTemplate.replace("analyze", "apply"),
    t.commandTemplate.replace('"{{failOn}}"', "critical"),
    t.commandTemplate.replace("{{outputFile}}", "{{nowhere}}"),
  ]) {
    assert.notDeepEqual(validate({ ...t, commandTemplate }), [], commandTemplate);
  }
});
