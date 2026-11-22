// Export files in, one schema v0.1 inventory out. Each file goes to the one adapter that
// reads its shape; a file no adapter reads is refused by name.
import { awsAdapter } from "./aws.ts";
import { entraAdapter } from "./entra.ts";
import { inventoryAdapter, InventoryError, readJson, type Adapter, type SdtExtensions } from "./inventory.ts";
import { oktaAdapter } from "./okta.ts";
import { formatSchemaError, validateInventory } from "./schema.ts";
import type { InputFile, Inventory } from "./types.ts";
import { VERSION } from "./version.ts";

export const EXPORT_ADAPTERS: Adapter[] = [awsAdapter, entraAdapter, oktaAdapter];

/** The export adapter that reads this file, or null (an inventory, or something unknown). */
export function exportAdapterFor(file: InputFile): Adapter | null {
  const doc = readJson(file);
  return inventoryAdapter.accepts(doc) ? null : (EXPORT_ADAPTERS.find((a) => a.accepts(doc)) ?? null);
}

/** Builds an inventory from export files. `asOf` is the window's end and the generatedAt. */
export function importExports(files: InputFile[], asOf: Date): InputFile {
  const groups = new Map<Adapter, InputFile[]>();
  for (const file of files) {
    const adapter = exportAdapterFor(file);
    if (!adapter) {
      throw new InventoryError(`${file.name}: not an AWS, Entra or Okta export this tool reads; pass one inventory on its own, or export files only`);
    }
    groups.set(adapter, [...(groups.get(adapter) ?? []), file]);
  }
  const ext: Required<SdtExtensions> = { sources: {}, awsRecommendations: {}, oktaReadOnly: {} };
  const doc: Inventory = {
    schemaVersion: "0.1",
    generatedAt: asOf.toISOString(),
    producer: { name: "scope-drift-trimmer", version: VERSION },
    identities: [...groups].flatMap(([adapter, group]) => {
      const e = adapter.extensions?.(group, asOf);
      Object.assign(ext.sources, e?.sources);
      Object.assign(ext.awsRecommendations, e?.awsRecommendations);
      Object.assign(ext.oktaReadOnly, e?.oktaReadOnly);
      return adapter.parse(group, asOf);
    }),
  };
  if (Object.keys(ext.awsRecommendations).length === 0) delete (ext as SdtExtensions).awsRecommendations;
  if (Object.keys(ext.oktaReadOnly).length === 0) delete (ext as SdtExtensions).oktaReadOnly;
  doc.x = { "scope-drift-trimmer": ext };
  const err = validateInventory(doc);
  if (err) throw new InventoryError(`imported inventory failed schema validation: ${formatSchemaError(err)}`);
  return { name: files.map((f) => f.name).join(", "), content: JSON.stringify(doc) };
}
