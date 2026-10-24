import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { DEFAULT_BASE_URL, Pantech, PantechError, VERSION } from "../src/index.ts";
import { json, mockClient } from "./helpers.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Pantech client", () => {
  it("sends the key, user agent and JSON headers", async () => {
    const { client, calls } = mockClient(() => json(200, { organization_id: "org_1" }));
    await client.me.get();
    const [call] = calls;
    expect(call?.url.href).toBe("https://api.test/public/v1/me");
    expect(call?.headers.get("authorization")).toBe("Bearer PAN_test_secret");
    expect(call?.headers.get("user-agent")).toBe(`pantech-js/${VERSION}`);
    expect(call?.headers.get("accept")).toBe("application/json");
    expect(call?.headers.get("idempotency-key")).toBeNull();
  });

  it("keeps VERSION in step with package.json", () => {
    expect(VERSION).toBe(pkg.version);
  });

  it("reads the key and URL from the environment", async () => {
    vi.stubEnv("PANTECH_API_KEY", "PAN_from_env");
    vi.stubEnv("PANTECH_API_URL", "https://api.example.com/public/v1/");
    const seen: string[] = [];
    const client = new Pantech({
      fetch: async (url, init) => {
        seen.push(url, new Headers(init.headers).get("authorization") ?? "");
        return json(200, {});
      },
    });
    expect(client.baseURL).toBe("https://api.example.com/public/v1");
    await client.me.get();
    expect(seen).toEqual(["https://api.example.com/public/v1/me", "Bearer PAN_from_env"]);
  });

  it("defaults to production", () => {
    vi.stubEnv("PANTECH_API_URL", "");
    expect(new Pantech({ apiKey: "PAN_x" }).baseURL).toBe(DEFAULT_BASE_URL);
    expect(DEFAULT_BASE_URL).toBe("https://api.pantechdynamics.com/public/v1");
  });

  it("refuses to start without a key", () => {
    vi.stubEnv("PANTECH_API_KEY", "");
    expect(() => new Pantech()).toThrow(PantechError);
    expect(() => new Pantech()).toThrow(/PANTECH_API_KEY/);
  });

  it("never shows the key when the client is logged", () => {
    const client = new Pantech({ apiKey: "PAN_very_secret" });
    expect(inspect(client, { depth: 5 })).not.toContain("PAN_very_secret");
    expect(JSON.stringify(Object.keys(client))).not.toContain("PAN_very_secret");
  });

  it("encodes query parameters and path ids", async () => {
    const { client, calls } = mockClient(() => json(200, { data: [], next_cursor: null }));
    await client.instances.list({ limit: 10, q: "web server", desired_state: undefined });
    await client.instances.get("vm/../1");
    expect(calls[0]?.url.search).toBe("?limit=10&q=web+server");
    expect(calls[1]?.url.pathname).toBe("/public/v1/instances/vm%2F..%2F1");
  });

  it("refuses an empty id", () => {
    const { client } = mockClient(() => json(200, {}));
    expect(() => client.instances.delete("")).toThrow(/resource id is required/);
  });

  it("sends JSON bodies with an Idempotency-Key on writes", async () => {
    const { client, calls } = mockClient(() => json(202, { operation_id: "op_1" }));
    await client.instances.rename("vm_1", { name: "web-2" });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers.get("content-type")).toBe("application/json");
    expect(calls[0]?.body).toEqual({ name: "web-2" });
    expect(calls[0]?.headers.get("idempotency-key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("uses a caller's Idempotency-Key and headers", async () => {
    const { client, calls } = mockClient(() => json(202, {}));
    await client.instances.stop("vm_1", { idempotencyKey: "key-1", headers: { "Pantech-Client": "mcp/1.0.0" } });
    expect(calls[0]?.headers.get("idempotency-key")).toBe("key-1");
    expect(calls[0]?.headers.get("pantech-client")).toBe("mcp/1.0.0");
  });

  it("returns undefined for 204", async () => {
    const { client } = mockClient(() => new Response(null, { status: 204 }));
    await expect(client.sshKeys.delete("sshk_1")).resolves.toBeUndefined();
    await expect(client.me.revoke()).resolves.toBeUndefined();
  });

  it("revokes the key with DELETE /me", async () => {
    const { client, calls } = mockClient(() => new Response(null, { status: 204 }));
    await client.me.revoke();
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url.pathname).toBe("/public/v1/me");
  });

  it("returns binary bodies", async () => {
    const { client } = mockClient(() => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }));
    const pdf = await client.billing.receipts.getPdf("rcpt_1");
    expect(new Uint8Array(pdf)).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it("offers a low-level request", async () => {
    const { client, calls } = mockClient(() => json(200, { ok: true }));
    const out = await client.request<{ ok: boolean }>({ method: "GET", path: "/regions", query: { a: [1, 2] } });
    expect(out.ok).toBe(true);
    expect(calls[0]?.url.search).toBe("?a=1&a=2");
  });
});
