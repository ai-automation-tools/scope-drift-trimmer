// The engine: inventory in, inventory with scope-drift-trimmer findings out. No Node
// built-ins here; the browser demo imports this module as-is (ADR-001).
import { exportAdapterFor, importExports } from "./import.ts";
import { InventoryError, parseInventory, type SdtExtensions } from "./inventory.ts";
import { runRules, type RuleFinding } from "./rules.ts";
import { formatSchemaError, validateInventory } from "./schema.ts";
import type { Finding, InputFile, Inventory, Severity } from "./types.ts";
import { VERSION } from "./version.ts";

export const PRODUCER = "scope-drift-trimmer";
export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];
const rank = (s: Severity) => SEVERITIES.length - SEVERITIES.indexOf(s);

export interface Analysis {
  /** The output document, schema-valid. */
  document: Inventory;
  /** This run's findings, most severe first, with the grant ids each one calls unused. */
  findings: RuleFinding[];
  summary: string;
}

/**
 * Analyzes one inventory file, or a set of AWS and Entra export files (imported first, with
 * `now` as the window's end). Throws InventoryError on an invalid input or output.
 */
export function analyze(input: InputFile | InputFile[], opts: { now?: Date } = {}): Analysis {
  const files = Array.isArray(input) ? input : [input];
  if (files.length === 0) throw new InventoryError("no input files");
  const now = opts.now ?? new Date();
  const file = files.length === 1 && !exportAdapterFor(files[0]) ? files[0] : importExports(files, now);
  return analyzeInventory(file, now);
}

function analyzeInventory(file: InputFile, now: Date): Analysis {
  const input = parseInventory(file);
  const ext = (input.x?.[PRODUCER] ?? {}) as SdtExtensions;
  const ctx = { asOf: Date.parse(input.generatedAt), source: file.name, sources: ext.sources, awsRecommendations: ext.awsRecommendations };
  const previous = new Map(
    (input.findings ?? []).filter((f) => f.ruleId.startsWith(`${PRODUCER}/`)).map((f) => [f.id, f]),
  );
  const findings = input.identities
    .flatMap((identity) => runRules(identity, ctx))
    // A reviewer's verdict on an earlier run's finding (accepted-risk, false-positive) sticks.
    .map((f) => ({ ...f, status: previous.get(f.id)?.status ?? f.status }))
    .sort((a, b) => rank(b.severity) - rank(a.severity));

  const document: Inventory = {
    ...input,
    generatedAt: now.toISOString(),
    producer: { name: PRODUCER, version: VERSION },
    identities: input.identities,
    findings: [
      ...(input.findings ?? []).filter((f) => !f.ruleId.startsWith(`${PRODUCER}/`)),
      ...findings.map(toFinding),
    ],
  };
  const err = validateInventory(document);
  if (err) throw new InventoryError(`output failed schema validation: ${formatSchemaError(err)}`);
  return { document, findings, summary: summarize(input, file.name, findings) };
}

/** Drops the internal unusedGrantIds list; the schema has no place for it. */
function toFinding(f: RuleFinding): Finding {
  const out: Finding & { unusedGrantIds?: string[] } = { ...f };
  delete out.unusedGrantIds;
  return out;
}

function summarize(input: Inventory, source: string, findings: Finding[]): string {
  const grants = input.identities.reduce((n, i) => n + (i.grants?.length ?? 0), 0);
  const names = new Map(input.identities.map((i) => [i.id, i.displayName]));
  const counts = SEVERITIES.map((s) => `${findings.filter((f) => f.severity === s).length} ${s}`).join(", ");
  return [
    `sdt ${VERSION}: ${source}, ${input.identities.length} identities, ${grants} grants, as of ${input.generatedAt}`,
    `Findings: ${counts}`,
    ...findings.map((f) => `  ${f.severity.toUpperCase().padEnd(8)}  ${names.get(f.identityId) ?? f.identityId}: ${f.title}`),
  ].join("\n");
}

/** True when any finding is at or above `threshold`, for --fail-on. */
export const failsAt = (findings: Finding[], threshold: Severity) =>
  findings.some((f) => rank(f.severity) >= rank(threshold));
