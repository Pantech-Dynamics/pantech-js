// Building access policy statements:
//
//   import { iam } from "@pantechdynamic/sdk";
//   await client.iam.policies.create({
//     name: "staging-operators",
//     statements: [
//       iam.allow(["instances:Read", "instances:Start"], ["name:staging-*"], { sourceIp: ["102.89.0.0/16"] }),
//       iam.deny(["*:Delete"]),
//     ],
//   });
//
// The helpers check the limits the API enforces, so a mistake fails before
// the call; the API still validates every statement, including that each
// action exists.

import type { IamStatement } from "./models.js";

type IamConditions = NonNullable<IamStatement["conditions"]>;

/** Optional parts of a statement. */
export interface StatementOptions {
  /** A name for the statement, unique within the policy: 1 to 64 letters, digits, `_` or `-`. */
  sid?: string;
  /** Only from these CIDRs (at most 20), e.g. `102.89.0.0/16`. */
  sourceIp?: string[];
  /** Only with (`true`) or without (`false`) MFA. An API key never satisfies `mfa: true`. */
  mfa?: boolean;
}

const SID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_ITEMS = 50;
const MAX_SOURCE_IPS = 20;

/** Pantech's managed policies: attach them by id; they cannot be changed. */
const MANAGED_POLICY_IDS = [
  "pol_pantech_read_only",
  "pol_pantech_developer",
  "pol_pantech_network_admin",
  "pol_pantech_database_admin",
  "pol_pantech_dns_manager",
  "pol_pantech_domain_manager",
  "pol_pantech_registry_push",
  "pol_pantech_registry_pull",
  "pol_pantech_billing_manager",
  "pol_pantech_support",
  "pol_pantech_deny_delete",
  "pol_pantech_require_mfa_for_writes",
] as const;

/** The id of one of Pantech's managed policies. */
export type ManagedPolicyId = (typeof MANAGED_POLICY_IDS)[number];

function strings(name: string, values: readonly string[], limit: number): string[] {
  if (!Array.isArray(values)) throw new TypeError(`${name} must be an array of strings.`);
  if (values.length === 0) throw new RangeError(`${name} needs at least one entry.`);
  if (values.length > limit) throw new RangeError(`${name} takes at most ${limit} entries, got ${values.length}.`);
  for (const v of values) {
    if (typeof v !== "string" || v === "") throw new TypeError(`${name} entries must be non-empty strings.`);
  }
  return [...values];
}

/** One policy statement. `resources` defaults to every resource (`*`). */
function statement(
  effect: "allow" | "deny",
  actions: readonly string[],
  resources: readonly string[] = ["*"],
  options: StatementOptions = {},
): IamStatement {
  if (effect !== "allow" && effect !== "deny") throw new TypeError(`effect must be "allow" or "deny".`);
  const out: IamStatement = {
    effect,
    actions: strings("actions", actions, MAX_ITEMS),
    resources: strings("resources", resources, MAX_ITEMS),
  };
  if (options.sid !== undefined) {
    if (!SID.test(options.sid)) throw new RangeError("sid must be 1 to 64 letters, digits, '_' or '-'.");
    out.sid = options.sid;
  }
  const conditions: IamConditions = {};
  if (options.sourceIp !== undefined) conditions.source_ip = strings("sourceIp", options.sourceIp, MAX_SOURCE_IPS);
  if (options.mfa !== undefined) conditions.mfa = options.mfa;
  if (Object.keys(conditions).length > 0) out.conditions = conditions;
  return out;
}

/** Policy statement builders, and Pantech's managed policy ids. */
export const iam = {
  /** An `allow` statement: `iam.allow(["instances:Start"], ["name:staging-*"])`. */
  allow: (actions: readonly string[], resources?: readonly string[], options?: StatementOptions): IamStatement =>
    statement("allow", actions, resources, options),
  /** A `deny` statement, which wins over every allow: `iam.deny(["*:Delete"])`. */
  deny: (actions: readonly string[], resources?: readonly string[], options?: StatementOptions): IamStatement =>
    statement("deny", actions, resources, options),
  statement,
  MANAGED_POLICY_IDS,
} as const;
