// The demo page. Every value from an inventory reaches the page through textContent, never
// innerHTML: a loaded file is hostile input. Nothing here makes a network request.
import { buildView, downloadText, SAMPLE, type DemoView } from "./demo.ts";
import type { InputFile } from "../src/types.ts";

type Child = Node | string | null | false;

function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c !== null && c !== false) el.append(c);
  return el;
}

const $ = (id: string) => document.getElementById(id)!;
const sev = (s: string) => h("span", { class: `sev sev-${s}` }, s.toUpperCase());
let current: DemoView | null = null;

function copyButton(text: string, label: string): HTMLElement {
  const btn = h("button", { type: "button", class: "btn btn-ghost btn-sm", "aria-label": label }, "Copy draft");
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Select and copy below";
    }
    setTimeout(() => (btn.textContent = "Copy draft"), 2000);
  });
  return btn;
}

function render(view: DemoView, source: string) {
  current = view;
  const names = new Map(view.identities.map((v) => [v.identity.id, v]));
  const grants = view.identities.reduce((n, v) => n + v.grants.length, 0);
  $("source").textContent = `${source}: ${view.identities.length} identities, ${grants} grants, ${view.analysis.findings.length} findings`;

  const banner = $("banner");
  banner.replaceChildren();
  if (view.banner) {
    const { finding } = view.banner;
    const anchor = names.get(finding.identityId)?.anchor ?? "";
    banner.className = `banner banner-${finding.severity}`;
    banner.append(
      h("p", { class: "eyebrow" }, "Flagged on load"),
      h("p", { class: "banner-line" }, sev(finding.severity), " ", h("a", { href: `#${anchor}` }, view.banner.identity), " · ", finding.ruleId.replace("scope-drift-trimmer/", "")),
      h("p", { class: "banner-title" }, finding.title),
    );
  } else {
    banner.className = "banner banner-none";
    banner.append(h("p", { class: "banner-title" }, "No findings in this file."));
  }

  const rows = view.analysis.findings.map((f) => {
    const who = names.get(f.identityId);
    return h(
      "tr",
      {},
      h("td", {}, sev(f.severity)),
      h("td", {}, h("a", { href: `#${who?.anchor ?? ""}` }, who?.identity.displayName ?? f.identityId)),
      h(
        "td",
        {},
        h("p", { class: "f-title" }, f.title),
        h("details", {}, h("summary", {}, "Evidence"), h("p", { class: "evidence" }, f.evidence ?? "")),
        f.remediation ? h("details", {}, h("summary", {}, "Draft remediation"), h("pre", {}, f.remediation)) : false,
      ),
      h("td", {}, f.remediation ? copyButton(f.remediation, `Copy draft for ${who?.identity.displayName ?? f.identityId}`) : h("span", { class: "muted" }, "no draft")),
    );
  });
  $("findings").replaceChildren(
    rows.length ? h("table", {}, h("caption", { class: "sr" }, "Findings, most severe first"),
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Severity"), h("th", { scope: "col" }, "Identity"), h("th", { scope: "col" }, "Finding"), h("th", { scope: "col" }, "Draft"))),
      h("tbody", {}, ...rows)) : h("p", { class: "muted" }, "No findings."),
  );

  $("identities").replaceChildren(
    ...view.identities.map((v) =>
      h(
        "article",
        { class: "card", id: v.anchor, tabindex: "-1" },
        h("h3", {}, v.identity.displayName),
        h("p", { class: "meta" }, `${v.identity.platform} · ${v.identity.kind} · owner: ${v.identity.owner?.email ?? v.identity.owner?.name ?? v.identity.owner?.team ?? "none recorded"} · last used: ${v.identity.lastUsedAt ?? "none recorded"}`),
        h("p", { class: "meta mono" }, v.identity.id),
        v.findings.length ? h("p", { class: "chips" }, ...v.findings.map((f) => sev(f.severity))) : h("p", { class: "chips muted" }, "no findings"),
        v.grants.length
          ? h("div", { class: "scroll" }, h("table", {},
              h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Permission"), h("th", { scope: "col" }, "Access"), h("th", { scope: "col" }, "Usage evidence"), h("th", { scope: "col" }, "Verdict"))),
              h("tbody", {}, ...v.grants.map((g) => h("tr", {},
                h("td", {}, h("span", { class: "mono" }, g.grant.permission), h("br"), h("span", { class: "muted" }, g.grant.resource)),
                h("td", {}, g.grant.access ?? "other"),
                h("td", {}, g.usage),
                h("td", {}, h("span", { class: `verdict v-${g.verdict.replace(" ", "-")}` }, g.verdict)),
              )))))
          : h("p", { class: "muted" }, "No grants."),
      ),
    ),
  );
}

function load(file: InputFile) {
  const status = $("load-status");
  try {
    render(buildView(file), file.name);
    status.textContent = file === SAMPLE ? "" : `Analyzed ${file.name} in your browser.`;
  } catch (e) {
    status.textContent = `Could not analyze ${file.name}: ${(e as Error).message}`;
  }
}

$("file").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (f) load({ name: f.name, content: await f.text() });
  input.value = "";
});
$("reset").addEventListener("click", () => load(SAMPLE));
$("download").addEventListener("click", () => {
  if (!current) return;
  const url = URL.createObjectURL(new Blob([downloadText(current)], { type: "application/json" }));
  const a = h("a", { href: url, download: "inventory.sdt.json" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

load(SAMPLE);
