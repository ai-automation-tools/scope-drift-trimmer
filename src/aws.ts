// AWS import: IAM Access Analyzer unused-access findings and IAM last-accessed reports, as the
// AWS CLI writes them (README, "Export from AWS"). Roles only: IAM users can be people, and
// human identities are out of scope. Shapes, checked 2026-11-10:
// https://docs.aws.amazon.com/access-analyzer/latest/APIReference/API_GetFindingV2.html
// https://docs.aws.amazon.com/access-analyzer/latest/APIReference/API_GetFindingRecommendation.html
// https://docs.aws.amazon.com/access-analyzer/latest/APIReference/API_GetAnalyzer.html
// https://docs.aws.amazon.com/IAM/latest/APIReference/API_GetServiceLastAccessedDetails.html
import { InventoryError, isoTime, readJson, type Adapter, type AwsRecommendation, type SdtExtensions } from "./inventory.ts";
import type { Access, Grant, Identity, InputFile } from "./types.ts";

/** The window for last-accessed data when no analyzer configuration is given. */
export const DEFAULT_WINDOW_DAYS = 90;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);

type Kind = "analyzer" | "finding" | "recommendation" | "lastAccessed";
function kindOf(o: Obj): Kind | null {
  if (isObj(o.analyzer)) return "analyzer";
  if (typeof o.findingType === "string" && typeof o.resource === "string") return "finding";
  if (Array.isArray(o.recommendedSteps) && typeof o.resourceArn === "string") return "recommendation";
  if (Array.isArray(o.ServicesLastAccessed) && typeof o.JobStatus === "string") return "lastAccessed";
  return null;
}

/** A file holds one CLI response or an array of them (the README's loops write arrays). */
const docs = (doc: unknown): Obj[] | null => {
  const list = Array.isArray(doc) ? doc : [doc];
  return list.length > 0 && list.every((o) => isObj(o) && kindOf(o) !== null) ? (list as Obj[]) : null;
};

/**
 * IAM records no use of iam:PassRole, and last-accessed data leaves out data-plane actions.
 * ponytail: a short list of the common data-plane actions; AWS publishes no complete one.
 */
const UNOBSERVABLE =
  /^(iam:PassRole|s3:(Get|Put|Delete)Object\w*|s3:(AbortMultipartUpload|RestoreObject)|dynamodb:(GetItem|PutItem|UpdateItem|DeleteItem|Query|Scan|Batch\w+|TransactGetItems|TransactWriteItems)|lambda:Invoke\w*|sqs:(SendMessage\w*|ReceiveMessage|DeleteMessage\w*)|sns:Publish\w*|kinesis:(PutRecords?|GetRecords)|firehose:PutRecord\w*|logs:PutLogEvents)$/;

/** ponytail: verb-based access level; AWS's per-action access-level table is the upgrade. */
function access(action: string): Access {
  const [service, verb = ""] = action.split(":");
  if (verb === "*") return "other"; // service-level: which actions the role holds is unknown
  if (/^(Get|List|Describe|Head|Lookup|Search|Select|View|BatchGet)/.test(verb)) return "read";
  return ["iam", "organizations", "sts", "kms"].includes(service) || verb.startsWith("Delete") ? "admin" : "write";
}

const roleArn = (arn: unknown) => typeof arn === "string" && /^arn:aws[\w-]*:iam::\d{12}:role\/.+/.test(arn);

interface Role {
  identity: Identity;
  grants: Map<string, Grant>;
  /** Identity-level last use from each source that records it; null means "none in its window". */
  lastUsed: (string | null)[];
  sources: Set<string>;
  recommendations: AwsRecommendation[];
}

function read(files: InputFile[]) {
  const items = files.flatMap((file) => {
    const list = docs(readJson(file));
    if (!list) throw new InventoryError(`${file.name}: not an AWS export this tool reads`);
    return list.map((o) => ({ file: file.name, o, kind: kindOf(o)! }));
  });

  const ages = new Set(items.filter((i) => i.kind === "analyzer").map((i) => (i.o.analyzer as Obj).configuration)
    .map((c) => (isObj(c) && isObj(c.unusedAccess) ? c.unusedAccess.unusedAccessAge : undefined)));
  if (ages.size > 1) throw new InventoryError("the analyzer files give different unusedAccessAge windows; analyze one analyzer at a time");
  const age = [...ages][0];
  if (age !== undefined && !(Number.isInteger(age) && (age as number) > 0)) {
    throw new InventoryError("the analyzer file has no unusedAccess.unusedAccessAge; export an unused-access analyzer");
  }
  if (age === undefined && items.some((i) => i.kind === "finding")) {
    throw new InventoryError("Access Analyzer findings need the analyzer's window: add the output of aws accessanalyzer get-analyzer");
  }
  const window = (age as number | undefined) ?? DEFAULT_WINDOW_DAYS;

  const roles = new Map<string, Role>();
  const role = (arn: string, file: string): Role => {
    let r = roles.get(arn);
    if (!r) {
      const identity: Identity = { id: `aws:${arn}`, kind: "service-account", platform: "aws", displayName: arn.slice(arn.lastIndexOf("/") + 1), status: "active" };
      r = { identity, grants: new Map(), lastUsed: [], sources: new Set(), recommendations: [] };
      roles.set(arn, r);
    }
    r.sources.add(file);
    return r;
  };
  const addGrant = (r: Role, action: string, lastUsedAt: string | null) => {
    const known = !UNOBSERVABLE.test(action);
    const prev = r.grants.get(action);
    const latest = [prev?.lastUsedAt ?? null, lastUsedAt].filter((t): t is string => t !== null).sort().pop() ?? null;
    r.grants.set(action, {
      id: action,
      resource: `aws:${action.split(":")[0]}:*`,
      permission: action,
      access: access(action),
      ...(known ? { lastUsedAt: latest, usageKnown: true, observationDays: window } : { usageKnown: false }),
    });
  };

  for (const { file, o, kind } of items) {
    if (kind === "finding") {
      if (o.status !== "ACTIVE" || o.resourceType !== "AWS::IAM::Role" || !roleArn(o.resource)) continue;
      const r = role(o.resource as string, file);
      for (const d of arr(o.findingDetails)) {
        if (isObj(d.unusedIamRoleDetails)) r.lastUsed.push(isoTime(d.unusedIamRoleDetails.lastAccessed, file));
        const p = d.unusedPermissionDetails;
        if (!isObj(p) || typeof p.serviceNamespace !== "string") continue;
        const actions = arr(p.actions);
        if (actions.length === 0) addGrant(r, `${p.serviceNamespace}:*`, isoTime(p.lastAccessed, file));
        for (const a of actions) {
          const name = String(a.action);
          addGrant(r, name.includes(":") ? name : `${p.serviceNamespace}:${name}`, isoTime(a.lastAccessed, file));
        }
      }
    } else if (kind === "recommendation") {
      if (o.status !== "SUCCEEDED" || !roleArn(o.resourceArn)) continue;
      const r = role(o.resourceArn as string, file);
      for (const step of arr(o.recommendedSteps).map((s) => s.unusedPermissionsRecommendedStep).filter(isObj)) {
        r.recommendations.push({
          action: String(step.recommendedAction),
          ...(typeof step.existingPolicyId === "string" ? { existingPolicyId: step.existingPolicyId } : {}),
          ...(typeof step.recommendedPolicy === "string" ? { recommendedPolicy: step.recommendedPolicy } : {}),
        });
      }
    } else if (kind === "lastAccessed") {
      if (o.JobStatus !== "COMPLETED") throw new InventoryError(`${file}: the last-accessed job is ${String(o.JobStatus)}, not COMPLETED`);
      if (o.IsTruncated === true) throw new InventoryError(`${file}: the last-accessed report is truncated; export every page`);
      const services = arr(o.ServicesLastAccessed);
      const arn = o.Arn ?? services.map((s) => s.LastAuthenticatedEntity).find(roleArn);
      if (typeof arn !== "string") throw new InventoryError(`${file}: no role ARN; add it with the README's --query`);
      if (!roleArn(arn)) continue; // a user, group or policy report
      const r = role(arn, file);
      const times = services.map((s) => isoTime(s.LastAuthenticated, file));
      r.lastUsed.push(times.filter((t) => t !== null).sort().pop() ?? null);
      services.forEach((s, i) => {
        const tracked = arr(s.TrackedActionsLastAccessed);
        addGrant(r, `${String(s.ServiceNamespace)}:*`, times[i]);
        for (const a of tracked) addGrant(r, `${String(s.ServiceNamespace)}:${String(a.ActionName)}`, isoTime(a.LastAccessedTime, file));
      });
    }
  }
  return [...roles.values()];
}

function toIdentity(r: Role): Identity {
  const used = r.lastUsed.filter((t): t is string => t !== null).sort().pop();
  return {
    ...r.identity,
    // Unknown (absent) unless a source records identity-level use; never inferred.
    ...(r.lastUsed.length ? { lastUsedAt: used ?? null } : {}),
    grants: [...r.grants.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export const awsAdapter: Adapter = {
  name: "aws",
  accepts: (doc) => docs(doc) !== null,
  parse: (files) => read(files).map(toIdentity),
  extensions(files): SdtExtensions {
    const roles = read(files);
    const recs = roles.filter((r) => r.recommendations.length);
    return {
      sources: Object.fromEntries(roles.map((r) => [r.identity.id, [...r.sources].sort()])),
      ...(recs.length ? { awsRecommendations: Object.fromEntries(recs.map((r) => [r.identity.id, r.recommendations])) } : {}),
    };
  },
};
