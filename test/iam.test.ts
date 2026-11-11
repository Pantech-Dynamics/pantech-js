import { describe, expect, it } from "vitest";
import { IAM_ERROR_CODES, iam, PermissionDeniedError, PreconditionFailedError, ValidationError } from "../src/index.ts";
import { json, mockClient, problem } from "./helpers.ts";

const policy = (extra: Record<string, unknown> = {}) =>
  json(200, {
    id: "pol_1",
    name: "staging-operators",
    description: "",
    managed: false,
    statements: [],
    attachment_count: 0,
    created_at: "2026-11-10T09:00:00Z",
    updated_at: "2026-11-10T09:00:00Z",
    version: 5,
    ...extra,
  });

describe("iam statement builders", () => {
  it("builds an allow with conditions", () => {
    expect(
      iam.allow(["instances:Read", "instances:Start"], ["name:staging-*"], {
        sid: "RestartStaging",
        sourceIp: ["102.89.0.0/16"],
        mfa: false,
      }),
    ).toEqual({
      effect: "allow",
      actions: ["instances:Read", "instances:Start"],
      resources: ["name:staging-*"],
      sid: "RestartStaging",
      conditions: { source_ip: ["102.89.0.0/16"], mfa: false },
    });
  });

  it("defaults a deny to every resource, without conditions", () => {
    expect(iam.deny(["*:Delete"])).toEqual({ effect: "deny", actions: ["*:Delete"], resources: ["*"] });
  });

  it("checks the API's limits before the call", () => {
    expect(() => iam.allow([])).toThrow(RangeError);
    expect(() => iam.allow(Array(51).fill("a:B"))).toThrow(/at most 50/);
    expect(() => iam.allow(["a:B"], [""])).toThrow(TypeError);
    expect(() => iam.allow(["a:B"], ["*"], { sid: "has space" })).toThrow(/sid/);
    expect(() => iam.allow(["a:B"], ["*"], { sourceIp: Array(21).fill("10.0.0.0/8") })).toThrow(/at most 20/);
  });

  it("lists Pantech's managed policies", () => {
    expect(iam.MANAGED_POLICY_IDS).toContain("pol_pantech_read_only");
    expect(iam.MANAGED_POLICY_IDS).toHaveLength(12);
  });
});

describe("iam.policies", () => {
  it("creates a policy from built statements", async () => {
    const { client, calls } = mockClient(() => policy());
    const statements = [iam.allow(["instances:Start"], ["name:staging-*"]), iam.deny(["*:Delete"])];
    await client.iam.policies.create({ name: "staging-operators", statements });
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/iam/policies");
    expect(calls[0]?.body).toEqual({ name: "staging-operators", statements });
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
  });

  it("replaces a policy with If-Match", async () => {
    const { client, calls } = mockClient(() => policy({ version: 6 }));
    await client.iam.policies.update(
      "pol_1",
      { name: "p", statements: [iam.allow(["instances:Read"])] },
      { ifMatch: 5 },
    );
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("PUT /public/v1/iam/policies/pol_1");
    expect(calls[0]?.headers.get("if-match")).toBe("5");
  });

  it("types VERSION_CONFLICT and INVALID_POLICY", async () => {
    const { client } = mockClient((_, i) =>
      i === 0
        ? problem(412, "VERSION_CONFLICT", "The policy changed.")
        : problem(422, "INVALID_POLICY", "A statement is invalid.", {
            errors: [{ field: "statements[0].actions[0]", code: "UNKNOWN_ACTION", message: "No such action." }],
          }),
    );
    const conflict = await client.iam.policies
      .update("pol_1", { name: "p", statements: [iam.allow(["x:Y"])] }, { ifMatch: 1 })
      .catch((e) => e);
    expect(conflict).toBeInstanceOf(PreconditionFailedError);
    const invalid = await client.iam.policies.create({ name: "p", statements: [iam.allow(["x:Y"])] }).catch((e) => e);
    expect(invalid).toBeInstanceOf(ValidationError);
    expect(IAM_ERROR_CODES).toContain(invalid.code);
    expect(invalid.errors[0].field).toBe("statements[0].actions[0]");
  });

  it("filters to your own policies", async () => {
    const { client, calls } = mockClient(() => json(200, { data: [], next_cursor: null }));
    await client.iam.policies.list({ managed: false });
    expect(calls[0]?.url.searchParams.get("managed")).toBe("false");
  });

  it("attaches and detaches", async () => {
    const { client, calls } = mockClient((_, i) =>
      i === 0
        ? json(201, { policy_id: "pol_1", principal_type: "team", principal_id: "team_1", attached_at: "x" })
        : new Response(null, { status: 204 }),
    );
    await client.iam.policies.attachments.attach("pol_1", { principal_type: "team", principal_id: "team_1" });
    await client.iam.policies.attachments.detach("pol_1", "team", "team_1");
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "POST /public/v1/iam/policies/pol_1/attachments",
      "DELETE /public/v1/iam/policies/pol_1/attachments/team/team_1",
    ]);
  });
});

describe("iam.teams, settings, simulate", () => {
  it("adds and removes a team member without a body", async () => {
    const { client, calls } = mockClient((_, i) =>
      i === 0
        ? json(200, { user_id: "usr_1", email: "ada@example.com", name: "Ada", role: "member", added_at: "x" })
        : new Response(null, { status: 204 }),
    );
    expect((await client.iam.teams.members.add("team_1", "usr_1")).user_id).toBe("usr_1");
    await client.iam.teams.members.remove("team_1", "usr_1");
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "PUT /public/v1/iam/teams/team_1/members/usr_1",
      "DELETE /public/v1/iam/teams/team_1/members/usr_1",
    ]);
    expect(calls[0]?.body).toBeUndefined();
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
  });

  it("types IAM_ADMIN_TARGET", async () => {
    const { client } = mockClient(() => problem(403, "IAM_ADMIN_TARGET", "Only owners act on admins."));
    const err = await client.iam.teams.members.add("team_1", "usr_admin").catch((e) => e);
    expect(err).toBeInstanceOf(PermissionDeniedError);
    expect(err.code).toBe("IAM_ADMIN_TARGET");
  });

  it("simulates and reads effective access", async () => {
    const { client, calls } = mockClient((_, i) =>
      i === 0
        ? json(200, { allowed: false, decision: "explicit_deny", policy_id: "pol_1", sid: "NoProd" })
        : json(200, {
            user_id: "usr_1",
            role: "member",
            teams: ["team_1"],
            policies: [{ policy_id: "pol_1", team_id: "team_1" }],
            member_baseline: "read",
          }),
    );
    const sim = await client.iam.simulate({
      user_id: "usr_1",
      action: "instances:Delete",
      resource: "vm_1",
      mfa: true,
    });
    expect(sim.decision).toBe("explicit_deny");
    const access = await client.iam.effectiveAccess("usr_1");
    expect(access.policies[0]?.team_id).toBe("team_1");
    expect(calls[0]?.body).toEqual({ user_id: "usr_1", action: "instances:Delete", resource: "vm_1", mfa: true });
    expect(calls[1]?.url.pathname).toBe("/public/v1/iam/members/usr_1/effective-access");
  });

  it("updates the member baseline", async () => {
    const { client, calls } = mockClient(() => json(200, { member_baseline: "none", version: 2, updated_at: "x" }));
    await client.iam.settings.update({ member_baseline: "none" });
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("PUT /public/v1/iam/settings");
    expect(calls[0]?.body).toEqual({ member_baseline: "none" });
  });

  it("lists every IAM code in the contract", () => {
    expect(IAM_ERROR_CODES).toHaveLength(13);
  });
});
