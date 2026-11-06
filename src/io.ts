// Node-only file access for the CLI. The engine takes contents, never paths.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import type { InputFile } from "./types.ts";

/** The file's base name, never its full path, is what evidence quotes. */
export const readInputFile = (path: string): InputFile => ({ name: basename(path), content: readFileSync(path, "utf8") });

export const writeJson = (path: string, doc: unknown) => writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
