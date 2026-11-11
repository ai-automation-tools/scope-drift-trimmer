import { formatSchemaError, validateInventory } from "./schema.ts";
import type { Identity, InputFile, Inventory } from "./types.ts";

/** A document the tool refuses to read or write. Nothing is written when one is thrown. */
export class InventoryError extends Error {
  override name = "InventoryError";
}

/** Parses (never evaluates) and validates one inventory document. */
export function parseInventory(file: InputFile): Inventory {
  const data = readJson(file);
  const version = (data as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof data === "object" && data !== null && version !== undefined && version !== "0.1") {
    throw new InventoryError(
      `${file.name}: unsupported schemaVersion ${JSON.stringify(version)}; this tool reads 0.1 (schema #/properties/schemaVersion/const)`,
    );
  }
  const err = validateInventory(data);
  if (err) throw new InventoryError(`${file.name}: ${formatSchemaError(err)}`);
  return data as Inventory;
}

/** Parses (never evaluates) a JSON file, dropping a BOM. */
export function readJson(file: InputFile): unknown {
  try {
    return JSON.parse(file.content.charCodeAt(0) === 0xfeff ? file.content.slice(1) : file.content);
  } catch (e) {
    throw new InventoryError(`${file.name}: not valid JSON (${(e as Error).message})`);
  }
}

/**
 * A platform timestamp as ISO 8601 UTC, or null when absent. Graph's own examples write
 * offsets like "-8:00", so a one-digit offset hour is padded first.
 */
export function isoTime(v: unknown, file: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  const ms = Date.parse(String(v).replace(/([+-])(\d:\d\d)$/, "$10$2"));
  if (typeof v !== "string" || Number.isNaN(ms)) throw new InventoryError(`${file}: unreadable timestamp ${JSON.stringify(v)}`);
  return new Date(ms).toISOString();
}

/** What this tool keeps under the document's x["scope-drift-trimmer"]. */
export interface SdtExtensions {
  /** The export files each identity was read from, for evidence. */
  sources?: Record<string, string[]>;
  /** IAM Access Analyzer's recommended policy steps, per identity id. */
  awsRecommendations?: Record<string, AwsRecommendation[]>;
}

export interface AwsRecommendation {
  action: string;
  existingPolicyId?: string;
  recommendedPolicy?: string;
}

/** Every importer implements this: exported files in, schema v0.1 identities out. */
export interface Adapter {
  name: string;
  /** Whether a parsed file is one this adapter reads. */
  accepts(doc: unknown): boolean;
  /** `asOf` ends the observation window; it defaults to now. */
  parse(files: InputFile[], asOf?: Date): Identity[];
  /** Data for x["scope-drift-trimmer"] that has no place in the schema. */
  extensions?(files: InputFile[], asOf?: Date): SdtExtensions;
}

/** Reads inventory documents another suite tool wrote; identities pass through unchanged. */
export const inventoryAdapter: Adapter = {
  name: "inventory",
  accepts: (doc) => typeof doc === "object" && doc !== null && "schemaVersion" in doc,
  parse: (files) => files.flatMap((f) => parseInventory(f).identities),
};
