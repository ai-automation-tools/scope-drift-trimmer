// Node-only file access for the CLI. The engine takes contents, never paths.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { InputFile } from "./types.ts";

/** The file's base name, never its full path, is what evidence quotes. */
export const readInputFile = (path: string): InputFile => ({ name: basename(path), content: readFileSync(path, "utf8") });

/** Files as given; a directory stands for every .json file directly inside it. */
export const readInputs = (paths: string[]): InputFile[] =>
  paths.flatMap((p) =>
    statSync(p).isDirectory()
      ? readdirSync(p).filter((n) => n.toLowerCase().endsWith(".json")).sort().map((n) => readInputFile(join(p, n)))
      : [readInputFile(p)],
  );

export const writeJson = (path: string, doc: unknown) => writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
