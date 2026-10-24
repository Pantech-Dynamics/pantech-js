import { describe, expect, it } from "vitest";
import {
  APIConnectionError,
  APITimeoutError,
  BadRequestError,
  InternalServerError,
  type Pantech,
  Pantech as PantechClient,
  RateLimitError,
} from "../src/index.ts";
import { json, mockClient, problem } from "./helpers.ts";

const retryNow = { "retry-after": "0" };

describe("retries", () => {
  it("retries 429, 500, 502, 503 and 504 with the same Idempotency-Key", async () => {
    const statuses = [429, 500, 502, 503, 504];
    const { client, calls } = mockClient((_, i) =>
      i < statuses.length ? json(statuses[i] as number, { code: "X" }, retryNow) : json(202, { operation_id: "op_1" }),
    );
    await expect(client.instances.create({} as never, { maxRetries: 5 })).resolves.toEqual({ operation_id: "op_1" });
    expect(calls).toHaveLength(6);
    const keys = new Set(calls.map((c) => c.headers.get("idempotency-key")));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBeTruthy();
  });

  it("backs off between retries when no Retry-After is given", async () => {
    const started = Date.now();
    const { client, calls } = mockClient((_, i) => (i === 0 ? json(503, {}) : json(200, { data: [] })));
    await client.regions.list();
    expect(calls).toHaveLength(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(350);
  });

  it("gives up after maxRetries", async () => {
    const { client, calls } = mockClient(() => json(503, { code: "UNAVAILABLE", detail: "Try later." }, retryNow), {
      maxRetries: 2,
    });
    await expect(client.regions.list()).rejects.toBeInstanceOf(InternalServerError);
    expect(calls).toHaveLength(3);
  });

  it("honours Retry-After on 429", async () => {
    const started = Date.now();
    const { client, calls } = mockClient((_, i) =>
      i === 0 ? json(429, { code: "RATE_LIMITED" }, { "retry-after": "1" }) : json(200, { data: [] }),
    );
    await client.regions.list();
    expect(calls).toHaveLength(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(950);
  });

  it("reports Retry-After when the retries run out", async () => {
    const { client } = mockClient(
      () => json(429, { code: "RATE_LIMITED", detail: "Slow down." }, { "retry-after": "0" }),
      {
        maxRetries: 0,
      },
    );
    const err = await client.regions.list().catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfterSeconds).toBe(0);
  });

  it("does not retry other 4xx", async () => {
    const { client, calls } = mockClient(() => problem(400, "INVALID_FILTER", "Bad filter."));
    await expect(client.instances.list()).rejects.toBeInstanceOf(BadRequestError);
    expect(calls).toHaveLength(1);
  });

  it("retries network errors", async () => {
    const { client, calls } = mockClient((_, i) => {
      if (i === 0) throw new TypeError("fetch failed");
      return json(200, { data: [] });
    });
    await expect(client.plans.list()).resolves.toEqual({ data: [] });
    expect(calls).toHaveLength(2);
  });

  it("warns that a write whose answer was lost may have gone through", async () => {
    const { client } = mockClient(
      () => {
        throw new TypeError("fetch failed");
      },
      { maxRetries: 0 },
    );
    const err = await client.volumes.create({} as never).catch((e) => e);
    expect(err).toBeInstanceOf(APIConnectionError);
    expect(err.message).toMatch(/may still have gone through/);
    expect(err.message).not.toContain("PAN_test_secret");
  });

  for (const [name, call] of [
    ["POST /ssh-keys", (c) => c.sshKeys.create({ name: "k" } as never)],
    ["DELETE /ssh-keys/{id}", (c) => c.sshKeys.delete("sshk_1")],
    ["POST /instances/{id}/console", (c) => c.instances.openConsole("vm_1")],
    ["POST /webhooks/{id}/test", (c) => c.webhooks.test("wh_1")],
    ["DELETE /webhooks/{id}", (c) => c.webhooks.delete("wh_1")],
    ["POST /webhooks/{id}/rotate-secret", (c) => c.webhooks.rotateSecret("wh_1")],
    ["POST /webhooks/{id}/deliveries/{id}/redeliver", (c) => c.webhooks.deliveries.redeliver("wh_1", "whd_1")],
    ["DELETE /me", (c) => c.me.revoke()],
  ] as const satisfies ReadonlyArray<readonly [string, (c: Pantech) => Promise<unknown>]>) {
    it(`sends ${name} once, since the API does not replay it`, async () => {
      const { client, calls } = mockClient(() => json(503, {}, retryNow));
      await expect(call(client)).rejects.toBeInstanceOf(InternalServerError);
      expect(calls).toHaveLength(1);

      const net = mockClient(() => {
        throw new TypeError("fetch failed");
      });
      await expect(call(net.client)).rejects.toBeInstanceOf(APIConnectionError);
      expect(net.calls).toHaveLength(1);
    });
  }

  it("still retries a 429 on a route that does not replay, since nothing ran", async () => {
    const { client, calls } = mockClient((_, i) =>
      i === 0 ? json(429, { code: "RATE_LIMITED" }, retryNow) : json(201, { id: "sshk_1" }),
    );
    await expect(client.sshKeys.create({ name: "k" } as never)).resolves.toEqual({ id: "sshk_1" });
    expect(calls).toHaveLength(2);
  });

  it("times out each attempt", async () => {
    const { client } = mockTimeoutClient(50);
    await expect(client.regions.list()).rejects.toBeInstanceOf(APITimeoutError);
  });

  it("stops at once when the caller aborts", async () => {
    const controller = new AbortController();
    const { client } = mockTimeoutClient(10_000);
    const pending = client.regions.list({}, { signal: controller.signal });
    controller.abort(new Error("cancelled by caller"));
    await expect(pending).rejects.toThrow("cancelled by caller");
  });
});

/** A client whose fetch never answers until its signal aborts. */
function mockTimeoutClient(timeout: number) {
  const client = new PantechClient({
    apiKey: "PAN_test_secret",
    timeout,
    maxRetries: 0,
    fetch: (_url, init) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  });
  return { client };
}
