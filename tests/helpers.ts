import { readFileSync } from "node:fs";
import type { InputFile } from "../src/types.ts";

export const fixturePath = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);

export const fixture = (name: string): InputFile => ({
  name: name.split("/").pop()!,
  content: readFileSync(fixturePath(name), "utf8"),
});
