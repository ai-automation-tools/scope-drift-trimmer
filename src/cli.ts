#!/usr/bin/env node
import { parseArgs } from "node:util";
import { analyze, failsAt, SEVERITIES } from "./engine.ts";
import { InventoryError } from "./inventory.ts";
import { readInputs, writeJson } from "./io.ts";
import type { Severity } from "./types.ts";
import { VERSION } from "./version.ts";

const USAGE = `Usage: sdt analyze <inventory.json> [--out <file>] [--fail-on <severity>]
       sdt analyze <export files or folders...> [--out <file>] [--fail-on <severity>]
       sdt --version

  Export files are AWS CLI output (IAM Access Analyzer unused-access findings, the analyzer,
  its recommendations, IAM last-accessed reports) and Microsoft Graph exports (service
  principals, appRoleAssignments, oauth2PermissionGrants, servicePrincipalSignInActivities).
  A folder stands for every .json file in it. The README shows the export commands.

  --out <file>          write the inventory with scope-drift-trimmer findings added
  --fail-on <severity>  exit 1 when a finding is at or above: ${SEVERITIES.join(", ")}

Exit codes: 0 ok, 1 --fail-on threshold reached, 2 bad usage or an invalid input.`;

function main(argv: string[]): number {
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: "string" },
        "fail-on": { type: "string" },
        version: { type: "boolean", short: "v" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = args;
  if (values.version) {
    console.log(`sdt ${VERSION}`);
    return 0;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (positionals[0] !== "analyze" || positionals.length < 2) {
    console.error(USAGE);
    return 2;
  }
  const failOn = values["fail-on"];
  if (failOn !== undefined && !SEVERITIES.includes(failOn as Severity)) {
    console.error(`--fail-on must be one of ${SEVERITIES.join(", ")}`);
    return 2;
  }

  let result;
  try {
    result = analyze(readInputs(positionals.slice(1)));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (e instanceof InventoryError || code === "ENOENT" || code === "EISDIR") {
      console.error(`sdt: ${(e as Error).message}`);
      return 2;
    }
    throw e;
  }
  if (values.out) writeJson(values.out, result.document);
  console.log(result.summary);
  if (values.out) console.log(`Wrote ${values.out}`);
  return failOn && failsAt(result.findings, failOn as Severity) ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
