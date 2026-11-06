// A validator for the vendored inventory schema. It covers exactly the JSON Schema keywords
// that schema uses (tests/schema.test.ts fails if a new one appears), so the engine needs no
// runtime dependency and runs unbundled in the browser demo.
import schema from "../schemas/agent-inventory.schema.json" with { type: "json" };

type Node = Record<string, unknown>;

export interface SchemaError {
  /** JSON pointer into the document, "" for the root. */
  instancePath: string;
  /** JSON pointer into the schema, e.g. "#/$defs/grant/properties/access/enum". */
  schemaPath: string;
  message: string;
}

export const INVENTORY_SCHEMA: Node = schema;

/** Keywords the validator enforces, plus annotations it may ignore. */
export const SUPPORTED_KEYWORDS = new Set([
  "type", "const", "enum", "pattern", "format", "minimum", "required", "properties",
  "additionalProperties", "items", "$ref", "$defs",
  "$schema", "$id", "title", "description", "examples", "default",
]);

const FORMATS: Record<string, (v: string) => boolean> = {
  "date-time": (v) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.test(v) && !Number.isNaN(Date.parse(v)),
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  uri: (v) => {
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  },
};

const isObject = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);

function isType(v: unknown, t: string): boolean {
  switch (t) {
    case "null": return v === null;
    case "array": return Array.isArray(v);
    case "object": return isObject(v);
    case "integer": return Number.isInteger(v);
    case "number": return typeof v === "number" && Number.isFinite(v);
    default: return typeof v === t;
  }
}

const escape = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");

function resolve(ref: string): Node {
  let node: unknown = schema;
  for (const part of ref.replace(/^#\//, "").split("/")) {
    node = (node as Node)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  if (!isObject(node)) throw new Error(`Unresolvable $ref ${ref}`);
  return node;
}

function check(node: Node, v: unknown, ip: string, sp: string): SchemaError | null {
  const fail = (keyword: string, message: string): SchemaError => ({
    instancePath: ip, schemaPath: `${sp}/${keyword}`, message,
  });
  if (typeof node.$ref === "string") return check(resolve(node.$ref), v, ip, node.$ref);

  if (node.type !== undefined) {
    const types = Array.isArray(node.type) ? (node.type as string[]) : [node.type as string];
    if (!types.some((t) => isType(v, t))) return fail("type", `must be ${types.join(" or ")}`);
  }
  if ("const" in node && v !== node.const) return fail("const", `must be ${JSON.stringify(node.const)}`);
  if (Array.isArray(node.enum) && !node.enum.includes(v)) {
    return fail("enum", `must be one of ${node.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  }
  if (typeof v === "string") {
    if (typeof node.pattern === "string" && !new RegExp(node.pattern, "u").test(v)) {
      return fail("pattern", `must match ${node.pattern}`);
    }
    if (typeof node.format === "string" && FORMATS[node.format] && !FORMATS[node.format](v)) {
      return fail("format", `must be a valid ${node.format}`);
    }
  }
  if (typeof v === "number" && typeof node.minimum === "number" && v < node.minimum) {
    return fail("minimum", `must be >= ${node.minimum}`);
  }
  if (isObject(v)) {
    for (const key of (node.required as string[] | undefined) ?? []) {
      if (!Object.hasOwn(v, key)) return fail("required", `missing required property "${key}"`);
    }
    const props = (node.properties as Node | undefined) ?? {};
    for (const key of Object.keys(v)) {
      const childIp = `${ip}/${escape(key)}`;
      if (Object.hasOwn(props, key)) {
        const err = check(props[key] as Node, v[key], childIp, `${sp}/properties/${escape(key)}`);
        if (err) return err;
      } else if (node.additionalProperties === false) {
        return { instancePath: childIp, schemaPath: `${sp}/additionalProperties`, message: `unknown property "${key}"` };
      }
    }
  }
  if (Array.isArray(v) && isObject(node.items)) {
    for (let i = 0; i < v.length; i++) {
      const err = check(node.items, v[i], `${ip}/${i}`, `${sp}/items`);
      if (err) return err;
    }
  }
  return null;
}

/** The first schema error in `doc`, or null when it is a valid v0.1 inventory. */
export function validateInventory(doc: unknown): SchemaError | null {
  return check(schema, doc, "", "#");
}

export function formatSchemaError(e: SchemaError): string {
  return `${e.instancePath || "/"} ${e.message} (schema ${e.schemaPath})`;
}
