// Finishes `npm run build`'s demo: tsc has compiled site/*.ts with the engine it imports into
// _site/; this adds the static files beside them. Paths stay relative for GitHub Pages.
import { copyFileSync } from "node:fs";

for (const file of ["index.html", "favicon.svg"]) {
  copyFileSync(new URL(`../site/${file}`, import.meta.url), new URL(`../_site/${file}`, import.meta.url));
}
console.log("Demo written to _site/");
