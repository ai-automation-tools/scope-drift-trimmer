// The Agent Security Suite's agent inventory format, schema v0.1
// (schemas/agent-inventory.schema.json). Only what the engine reads is typed closely.

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Access = "read" | "write" | "admin" | "execute" | "other";
export type Timestamp = string | null;

export interface Grant {
  id: string;
  resource: string;
  permission: string;
  access?: Access;
  grantedAt?: Timestamp;
  grantedBy?: string;
  lastUsedAt?: Timestamp;
  usageKnown?: boolean;
  observationDays?: number;
}

export interface Owner {
  name?: string;
  email?: string;
  team?: string;
  verifiedAt?: Timestamp;
}

export interface Identity {
  id: string;
  kind: string;
  platform: string;
  displayName: string;
  owner?: Owner | null;
  status: string;
  createdAt?: Timestamp;
  lastUsedAt?: Timestamp;
  retiredAt?: Timestamp;
  credentials?: unknown[];
  grants?: Grant[];
  tools?: unknown[];
  tags?: string[];
}

export interface Finding {
  id: string;
  identityId: string;
  ruleId: string;
  severity: Severity;
  title: string;
  evidence?: string;
  remediation?: string;
  status?: "open" | "accepted-risk" | "fixed" | "false-positive";
  references?: string[];
}

export interface Inventory {
  schemaVersion: "0.1";
  generatedAt: string;
  producer: { name: string; version: string; url?: string };
  identities: Identity[];
  findings?: Finding[];
  x?: Record<string, unknown>;
}

/** A file's name and contents. The engine never touches the file system (ADR-001). */
export interface InputFile {
  name: string;
  content: string;
}
