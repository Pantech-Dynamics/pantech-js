import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { ConflictError, isPantechError, NotFoundError, REGISTRY_ERROR_CODES } from "../src/index.ts";
import { json, mockClient, problem } from "./helpers.ts";

const SECRET = "prt_01JD_s3cr3tvalue";

const token = (extra: Record<string, unknown> = {}) => ({
  id: "prt_01JD",
  name: "github-actions",
  permission: "push",
  repositories: ["api/server"],
  expires_at: null,
  last_used_at: null,
  created_at: "2026-11-10T09:00:00Z",
  revoked_at: null,
  ...extra,
});

describe("registry.namespace", () => {
  it("gets and sets the namespace", async () => {
    const { client, calls } = mockClient(() =>
      json(200, { name: "acme", registry_host: "registry.pantechdynamics.com" }),
    );
    expect((await client.registry.namespace.get()).name).toBe("acme");
    await client.registry.namespace.set({ name: "acme", create_on_push: false });
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "GET /public/v1/registry",
      "PUT /public/v1/registry",
    ]);
    expect(calls[1]?.body).toEqual({ name: "acme", create_on_push: false });
    expect(calls[1]?.headers.get("idempotency-key")).toBeTruthy();
  });

  it("types REGISTRY_NAMESPACE_NOT_SET", async () => {
    const { client } = mockClient(() => problem(404, "REGISTRY_NAMESPACE_NOT_SET", "Claim a namespace first."));
    const err = await client.registry.namespace.get().catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(isPantechError(err, "REGISTRY_NAMESPACE_NOT_SET")).toBe(true);
    expect(REGISTRY_ERROR_CODES).toContain(err.code);
  });
});

describe("registry.repositories and tags", () => {
  it("creates and updates a repository", async () => {
    const { client, calls } = mockClient(() => json(201, { id: "crr_1", name: "api/server" }));
    await client.registry.repositories.create({
      name: "api/server",
      immutable_tags: true,
      retention: { keep_last: 50, keep_pattern: "v*" },
    });
    await client.registry.repositories.update("crr_1", {
      visibility: "public",
      retention: { untagged_after_days: null },
    });
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/registry/repositories");
    expect(calls[0]?.body).toEqual({
      name: "api/server",
      immutable_tags: true,
      retention: { keep_last: 50, keep_pattern: "v*" },
    });
    expect(`${calls[1]?.method} ${calls[1]?.url.pathname}`).toBe("PATCH /public/v1/registry/repositories/crr_1");
    expect(calls[1]?.body).toEqual({ visibility: "public", retention: { untagged_after_days: null } });
  });

  it("lists every tag across pages", async () => {
    const { client, calls } = mockClient((_, i) =>
      json(
        200,
        i === 0 ? { data: [{ name: "v2" }], next_cursor: "c2" } : { data: [{ name: "v1" }], next_cursor: null },
      ),
    );
    const names: string[] = [];
    for await (const t of client.registry.tags.listAll("crr_1")) names.push(t.name);
    expect(names).toEqual(["v2", "v1"]);
    expect(calls[1]?.url.searchParams.get("cursor")).toBe("c2");
  });

  it("escapes the tag in the path", async () => {
    const { client, calls } = mockClient(() => json(200, { name: "a/b" }));
    await client.registry.tags.get("crr_1", "a/b");
    expect(calls[0]?.url.pathname).toBe("/public/v1/registry/repositories/crr_1/tags/a%2Fb");
  });

  it("types TAG_IMMUTABLE on a refused delete", async () => {
    const { client, calls } = mockClient(() => problem(409, "TAG_IMMUTABLE", "The repository has immutable tags."));
    const err = await client.registry.tags.delete("crr_1", "v1").catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.code).toBe("TAG_IMMUTABLE");
    expect(calls[0]?.method).toBe("DELETE");
  });
});

describe("registry.tokens", () => {
  it("returns the secret but keeps it out of logs and JSON", async () => {
    const { client, calls } = mockClient(() => json(201, token({ secret: SECRET })));
    const created = await client.registry.tokens.create({
      name: "github-actions",
      permission: "push",
      repositories: ["api/server"],
    });
    expect(created.secret).toBe(SECRET);
    expect(inspect(created)).not.toContain(SECRET);
    expect(JSON.stringify(created)).not.toContain(SECRET);
    expect(Object.keys(created)).not.toContain("secret");
    expect(created.id).toBe("prt_01JD");
    expect(calls[0]?.body).toEqual({ name: "github-actions", permission: "push", repositories: ["api/server"] });
  });

  it("lists and revokes tokens", async () => {
    const { client, calls } = mockClient((_, i) =>
      i === 0 ? json(200, { data: [token()], next_cursor: null }) : new Response(null, { status: 204 }),
    );
    expect((await client.registry.tokens.list()).data[0]?.id).toBe("prt_01JD");
    expect(await client.registry.tokens.delete("prt_01JD")).toBeUndefined();
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "GET /public/v1/registry/tokens",
      "DELETE /public/v1/registry/tokens/prt_01JD",
    ]);
  });

  it("lists every registry code in the contract", () => {
    expect(REGISTRY_ERROR_CODES).toHaveLength(15);
  });
});
