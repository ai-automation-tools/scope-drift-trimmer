// The demo's view model: the CLI's engine and rules, imported as-is (ADR-001), turned into
// what the page draws. No DOM here, so tests/demo.test.ts can run it under Node.
import { analyze, type Analysis } from "../src/engine.ts";
import type { Finding, Grant, Identity, InputFile } from "../src/types.ts";
import sample from "./sample.inventory.json" with { type: "json" };

export const SAMPLE: InputFile = { name: "sample.inventory.json", content: JSON.stringify(sample) };

export interface GrantRow {
  grant: Grant;
  /** The evidence label, always stated: what the platform records about this grant's use. */
  usage: string;
  /** "called unused" only when a finding says so; "not judged" when use isn't recorded. */
  verdict: "called unused" | "not judged" | "no finding";
}

export interface IdentityView {
  identity: Identity;
  anchor: string;
  grants: GrantRow[];
  findings: Finding[];
}

export interface DemoView {
  analysis: Analysis;
  /** The most severe finding, named on load, or null when there are none. */
  banner: { identity: string; finding: Finding } | null;
  identities: IdentityView[];
}

export function usageLabel(g: Grant): string {
  if (g.usageKnown !== true) return "usageKnown: false · the platform records no use of this grant";
  const window = g.observationDays === undefined ? "no window stated" : `${g.observationDays}-day window`;
  return `usageKnown: true · last used ${g.lastUsedAt ?? "none recorded"} · ${window}`;
}

/** Analyzes one inventory, or AWS, Entra and Okta export files. Throws InventoryError on bad input. */
export function buildView(input: InputFile | InputFile[], now?: Date): DemoView {
  const analysis = analyze(input, { now });
  const unused = new Set(analysis.findings.flatMap((f) => f.unusedGrantIds.map((g) => `${f.identityId}\u0000${g}`)));
  const identities = analysis.document.identities.map((identity, i) => ({
    identity,
    anchor: `identity-${i + 1}`,
    findings: analysis.findings.filter((f) => f.identityId === identity.id),
    grants: (identity.grants ?? []).map((grant): GrantRow => ({
      grant,
      usage: usageLabel(grant),
      verdict: unused.has(`${identity.id}\u0000${grant.id}`) ? "called unused" : grant.usageKnown === true ? "no finding" : "not judged",
    })),
  }));
  const top = analysis.findings[0];
  const banner = top
    ? { identity: identities.find((v) => v.identity.id === top.identityId)?.identity.displayName ?? top.identityId, finding: top }
    : null;
  return { analysis, banner, identities };
}

/** The output document as the file "Download inventory" saves. */
export const downloadText = (view: DemoView) => `${JSON.stringify(view.analysis.document, null, 2)}\n`;
