// Builds the Cronsole template catalog (Registry v1) into registry/. publish-registry.yml mirrors it
// into the private scope-drift-trimmer-site repo, which serves it at HOSTED, where the Cronsole
// gallery (https://cronsole.ai-automation-tools.dev/) reads it. Modelled on edge-spectrum's
// site/scripts/build-registry.mjs.
//
//   registry/templates/<id>.json   one template per file
//   registry/packs/<id>.json       an importable bundle
//   registry/index.json            every template and pack with the sha256 of its exact bytes
//
// Deterministic and LF (no timestamps): Cronsole verifies each file's sha256 over its bytes. Edit the
// templates HERE, never the output. Also fails when the README stops linking a template, or a
// template's command changed without its version moving (a user who imported it compares versions).
//
//   node scripts/build-registry.ts              write registry/
//   node scripts/build-registry.ts --check      exit 1 if registry/ or a README link is stale
//   node scripts/build-registry.ts --published  exit 1 if the hosted copy differs (network; CI only)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SEVERITIES } from "../src/engine.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = join(ROOT, "registry");
export const HOSTED = "https://scope-drift-trimmer.ai-automation-tools.dev/registry/";
export const GALLERY = "https://cronsole.ai-automation-tools.dev/";

type Template = {
  schemaVersion: "1.0";
  id: string;
  name: string;
  description: string;
  runtime: string;
  os: string;
  category: string;
  tags: string[];
  icon: string;
  trigger: { kind: "schedule"; cron: string };
  commandTemplate: string;
  parameters: { key: string; label: string; type: string; default?: string; options?: string[]; required: boolean; help: string }[];
  compatibleTargets: string[];
  execution: { timeoutSec: number; retries: number };
  author: string;
  version: string;
};

// Only an inventory another suite tool writes, not a platform export: an export's windows end at the
// run's own time, so re-running on a folder nobody refreshed would slide the window past the data
// and call grants unused that nobody watched. That template waits for sdt to know an export's age.
export const TEMPLATES: Template[] = [
  {
    schemaVersion: "1.0",
    id: "scope-drift-trimmer-inventory-review",
    name: "Scope Drift Trimmer: Inventory Access Review",
    description:
      "Runs `sdt analyze` on an Agent Security Suite inventory that another suite tool writes on its own schedule, "
      + "and writes it back with scope-drift-trimmer findings: dormant privileged identities, unused grants, narrower "
      + "permissions, and write or admin grants whose use the platform doesn't record. Fails the run when a finding is "
      + "at or above the chosen severity, so the failure alert is the prompt to review. Every finding carries a draft "
      + "remediation for a human to review and run; nothing is applied. Usage windows end at the inventory's own "
      + "generatedAt, so the output file must not be the inventory: sdt stamps its output with the run's time. Reads one file, writes one, makes no "
      + "network call and holds no credential. Needs Node 22.18 or newer and a clone of scope-drift-trimmer with "
      + "`npm install` and `npm run build` run in it.",
    runtime: "node",
    os: "cross-platform",
    category: "monitoring",
    tags: ["scope-drift-trimmer", "access-review", "nhi", "iam", "least-privilege"],
    icon: "ShieldCheck",
    trigger: { kind: "schedule", cron: "15 7 * * *" },
    commandTemplate:
      'node "{{repoPath}}/dist/src/cli.js" analyze "{{inventoryFile}}" --out "{{outputFile}}" --fail-on "{{failOn}}"',
    parameters: [
      {
        key: "repoPath", label: "scope-drift-trimmer clone", type: "path", required: true,
        help: "Absolute path to your clone of ai-automation-tools/scope-drift-trimmer, with `npm install` and `npm run build` run in it.",
      },
      {
        key: "inventoryFile", label: "Inventory file", type: "path", required: true,
        help: "The agent inventory (schema v0.1) another suite tool writes. Not a platform export: point sdt at an export the day you take it.",
      },
      {
        key: "outputFile", label: "Output file", type: "path", required: true,
        help: "Where the inventory with findings goes, overwritten each run. Not the inventory file itself: the output is stamped with the run's time, so analyzing it again would end every window after the data stops.",
      },
      {
        key: "failOn", label: "Fail at severity", type: "select", default: "critical", options: [...SEVERITIES], required: true,
        help: "The run fails when a finding is at or above this severity. critical is a dormant privileged identity with no owner on record.",
      },
    ],
    compatibleTargets: ["windows", "cronsole-native", "linux", "macos"],
    execution: { timeoutSec: 120, retries: 0 },
    author: "ai-automation-tools",
    version: "0.1.0",
  },
];

const PACKS = [
  {
    id: "scope-drift-trimmer",
    name: "Scope Drift Trimmer: Access Review",
    description: "Re-runs the non-human identity access review on the inventory the Agent Security Suite writes, and fails when a finding needs a human.",
    templateIds: ["scope-drift-trimmer-inventory-review"],
  },
];

// Mirrors cronsole backend/src/catalog/schema.ts (Registry v1).
const TARGETS = new Set(["windows", "cronsole-native", "macos", "linux", "claude-code", "chatgpt", "gemini"]);
// These commands run on other people's machines. The only shape allowed is the built sdt in the
// user's clone running `analyze` on a parameter, then flags the README documents, each a parameter.
const COMMAND_SHAPE = /^node "\{\{repoPath\}\}\/dist\/src\/cli\.js" analyze "\{\{\w+\}\}"( --(out|fail-on) "\{\{\w+\}\}")*$/;

export function validate(t: Template): string[] {
  const errs: string[] = [];
  const req = (ok: unknown, msg: string) => { if (!ok) errs.push(`${t.id}: ${msg}`); };
  req(/^scope-drift-trimmer(-[a-z0-9]+)+$/.test(t.id), "id must match scope-drift-trimmer-<name> so it can't collide with Cronsole ids");
  req(t.schemaVersion === "1.0" && t.name, "schemaVersion 1.0 and a name are required");
  req(t.trigger?.kind === "schedule" && t.trigger.cron.split(" ").length === 5, "trigger must be a 5-field schedule");
  req(t.compatibleTargets.length && t.compatibleTargets.every((x) => TARGETS.has(x)), "bad compatibleTargets");
  const keys = new Set(t.parameters.map((p) => p.key));
  const used = [...t.commandTemplate.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  req(used.every((k) => keys.has(k)), `placeholders without parameters: ${used.filter((k) => !keys.has(k))}`);
  req(COMMAND_SHAPE.test(t.commandTemplate), 'commandTemplate must be node "{{repoPath}}/dist/src/cli.js" analyze "{{param}}", then --out or --fail-on "{{param}}" pairs');
  return errs;
}

const dump = (obj: unknown) => `${JSON.stringify(obj, null, 2)}\n`;
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Every registry file's path (relative to registry/) and exact bytes. Throws when a template is invalid. */
export function build(): Map<string, string> {
  const errs = TEMPLATES.flatMap(validate);
  const ids = new Set(TEMPLATES.map((t) => t.id));
  for (const p of PACKS) for (const id of p.templateIds) if (!ids.has(id)) errs.push(`pack ${p.id}: unknown template ${id}`);
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  for (const id of ids) if (!readme.includes(`${GALLERY}#/t/${id}`)) errs.push(`README.md does not link ${GALLERY}#/t/${id}`);
  // The committed output is the last published version of each template.
  for (const t of TEMPLATES) {
    const file = join(OUT, "templates", `${t.id}.json`);
    if (!existsSync(file)) continue;
    const prev = JSON.parse(readFileSync(file, "utf8")) as Template;
    if (prev.commandTemplate !== t.commandTemplate && prev.version === t.version) {
      errs.push(`${t.id}: commandTemplate changed but version is still ${t.version}; bump it`);
    }
  }
  if (errs.length) throw new Error(`Registry validation failed:\n  ${errs.join("\n  ")}`);

  const files = new Map<string, string>();
  const templates = [...TEMPLATES].sort((a, b) => a.id.localeCompare(b.id)).map((t) => {
    const path = `templates/${t.id}.json`;
    const body = dump(t);
    files.set(path, body);
    const { id, name, description, category, tags, runtime, os, compatibleTargets } = t;
    return { id, name, description, category, tags, runtime, os, compatibleTargets, path, sha256: sha(body) };
  });
  const packs = PACKS.map(({ templateIds, ...meta }) => {
    const path = `packs/${meta.id}.json`;
    const body = dump({ cronsoleCatalogVersion: "1.0", pack: meta, templates: templateIds.map((id) => TEMPLATES.find((t) => t.id === id)) });
    files.set(path, body);
    return { ...meta, templateIds, path, sha256: sha(body) };
  });
  files.set("index.json", dump({ registryVersion: "1.0", templates, packs }));
  return files;
}

/** Paths in registry/ that are missing, differ from what build() writes, or shouldn't be there. */
export function stale(files: Map<string, string>): string[] {
  const walk = (dir: string): string[] =>
    !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [relative(OUT, join(dir, e.name)).split("\\").join("/")]);
  const changed = [...files].filter(([p, b]) => !existsSync(join(OUT, p)) || readFileSync(join(OUT, p), "utf8") !== b).map(([p]) => p);
  return [...changed, ...walk(OUT).filter((p) => !files.has(p))];
}

/** Compares the hosted catalog with registry/: CORS header, every path and sha256, and the served bytes. */
async function published(base: string): Promise<string[]> {
  type Index = { templates: { path: string; sha256: string }[]; packs?: { path: string; sha256: string }[] };
  const entries = (index: Index) => new Map([...index.templates, ...(index.packs ?? [])].map((e) => [e.path, e.sha256]));
  const local = entries(JSON.parse(readFileSync(join(OUT, "index.json"), "utf8")) as Index);
  const problems: string[] = [];
  const res = await fetch(`${base}index.json`);
  if (res.headers.get("access-control-allow-origin") !== "*") problems.push("index.json is served without Access-Control-Allow-Origin: *");
  let live = new Map<string, string>();
  try { live = entries((await res.json()) as Index); } catch { problems.push(`index.json is not JSON (HTTP ${res.status}): not published?`); }
  for (const p of local.keys()) if (!live.has(p)) problems.push(`missing from the host: ${p}`);
  for (const p of live.keys()) if (!local.has(p)) problems.push(`on the host but not in registry/: ${p}`);
  for (const [p, h] of local) if (live.has(p) && live.get(p) !== h) problems.push(`different sha256 in the hosted index: ${p}`);
  for (const [p, h] of live) {
    const body = Buffer.from(await (await fetch(base + p)).arrayBuffer());
    if (sha(body) !== h) problems.push(`served bytes don't match the hosted index: ${p}`);
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--published")) {
    const problems = await published(HOSTED);
    for (const p of problems) console.log(`DRIFT ${p}`);
    console.log(`${HOSTED}: ${problems.length} problem(s)`);
    process.exit(problems.length ? 1 : 0);
  }
  const files = build();
  const old = stale(files);
  if (process.argv.includes("--check")) {
    for (const p of old) console.log(`stale: registry/${p}`);
    if (old.length) {
      console.log("Run `node scripts/build-registry.ts` and commit registry/.");
      process.exit(1);
    }
    console.log(`registry OK: ${files.size} files current`);
  } else {
    for (const p of old) if (!files.has(p)) rmSync(join(OUT, p));
    for (const [p, b] of files) {
      mkdirSync(dirname(join(OUT, p)), { recursive: true });
      writeFileSync(join(OUT, p), b);
    }
    console.log(`registry: ${TEMPLATES.length} template(s), ${PACKS.length} pack(s) -> registry/`);
  }
}
