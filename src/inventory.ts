import { formatSchemaError, validateInventory } from "./schema.ts";
import type { Identity, InputFile, Inventory } from "./types.ts";

/** A document the tool refuses to read or write. Nothing is written when one is thrown. */
export class InventoryError extends Error {
  override name = "InventoryError";
}

/** Parses (never evaluates) and validates one inventory document. */
export function parseInventory(file: InputFile): Inventory {
  let data: unknown;
  try {
    data = JSON.parse(file.content.charCodeAt(0) === 0xfeff ? file.content.slice(1) : file.content); // drop a BOM
  } catch (e) {
    throw new InventoryError(`${file.name}: not valid JSON (${(e as Error).message})`);
  }
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

/** Every importer implements this: exported files in, schema v0.1 identities out. */
export interface Adapter {
  name: string;
  parse(files: InputFile[]): Identity[];
}

/** Reads inventory documents another suite tool wrote; identities pass through unchanged. */
export const inventoryAdapter: Adapter = {
  name: "inventory",
  parse: (files) => files.flatMap((f) => parseInventory(f).identities),
};
