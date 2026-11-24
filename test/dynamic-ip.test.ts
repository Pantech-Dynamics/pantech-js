import { describe, expect, it } from "vitest";
import {
  APIConnectionError,
  type DynamicIp,
  type DynamicIpEvent,
  InternalServerError,
  type PutDynamicIpRequest,
} from "../src/index.ts";
import { json, mockClient } from "./helpers.ts";

const retryNow = { "retry-after": "0" };

const sampleEvent: DynamicIpEvent = {
  kind: "enabled",
  from_address: null,
  to_address: "198.51.100.42",
  degraded: false,
  occurred_at: "2026-11-24T12:00:00Z",
};

const sampleDynamicIp = (extra: Partial<DynamicIp> = {}): DynamicIp => ({
  instance_id: "vm_1",
  schedule: "weekly",
  connections: "keep",
  on_demand: false,
  state: "active",
  current_address: "198.51.100.42",
  next_rotation_at: "2026-12-01T12:00:00Z",
  last_rotated_at: "2026-11-24T12:00:00Z",
  surcharge_percent: 40,
  on_demand_used: 0,
  on_demand_limit: 10,
  failure_reason: null,
  events: [sampleEvent],
  ...extra,
});

describe("instances.dynamicIp", () => {
  it("gets dynamic IP status without an Idempotency-Key", async () => {
    const payload = sampleDynamicIp();
    const { client, calls } = mockClient(() => json(200, payload));
    const res: DynamicIp = await client.instances.dynamicIp.get("vm_1");
    expect(res).toEqual(payload);
    expect(calls).toHaveLength(1);
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("GET /public/v1/instances/vm_1/address-rotation");
    expect(calls[0]?.headers.has("idempotency-key")).toBe(false);
  });

  it("turns on dynamic IP (201) and updates settings (200) with Idempotency-Key", async () => {
    const enabling = sampleDynamicIp({ state: "enabling", current_address: null, events: [] });
    const updated = sampleDynamicIp({ schedule: "daily", connections: "move", on_demand: true, surcharge_percent: 95 });
    const { client, calls } = mockClient((_, i) => (i === 0 ? json(201, enabling) : json(200, updated)));

    const firstReq: PutDynamicIpRequest = { schedule: "weekly" };
    expect(await client.instances.dynamicIp.set("vm_1", firstReq)).toEqual(enabling);

    const secondReq: PutDynamicIpRequest = { schedule: "daily", connections: "move", on_demand: true };
    expect(await client.instances.dynamicIp.set("vm_1", secondReq, { idempotencyKey: "dyn-key-2" })).toEqual(updated);

    expect(calls).toHaveLength(2);
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("PUT /public/v1/instances/vm_1/address-rotation");
    expect(calls[0]?.body).toEqual({ schedule: "weekly" });
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();

    expect(`${calls[1]?.method} ${calls[1]?.url.pathname}`).toBe("PUT /public/v1/instances/vm_1/address-rotation");
    expect(calls[1]?.body).toEqual({ schedule: "daily", connections: "move", on_demand: true });
    expect(calls[1]?.headers.get("idempotency-key")).toBe("dyn-key-2");
  });

  it("disables dynamic IP with an Idempotency-Key", async () => {
    const disabling = sampleDynamicIp({ state: "disabling" });
    const { client, calls } = mockClient(() => json(200, disabling));
    const res = await client.instances.dynamicIp.disable("vm_1");
    expect(res).toEqual(disabling);
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("DELETE /public/v1/instances/vm_1/address-rotation");
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
  });

  it("rotates the dynamic IP now with an Idempotency-Key", async () => {
    const rotated = sampleDynamicIp({
      on_demand: true,
      current_address: "198.51.100.99",
      on_demand_used: 1,
      surcharge_percent: 95,
    });
    const { client, calls } = mockClient(() => json(200, rotated));
    const res = await client.instances.dynamicIp.rotate("vm_1", { idempotencyKey: "rot-1" });
    expect(res).toEqual(rotated);
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe(
      "POST /public/v1/instances/vm_1/address-rotation/rotate",
    );
    expect(calls[0]?.headers.get("idempotency-key")).toBe("rot-1");
  });

  it("does not retry rotate on 5xx or network errors, since the API does not replay it", async () => {
    const serverErr = mockClient(() => json(503, {}, retryNow));
    await expect(serverErr.client.instances.dynamicIp.rotate("vm_1")).rejects.toBeInstanceOf(InternalServerError);
    expect(serverErr.calls).toHaveLength(1);

    const netErr = mockClient(() => {
      throw new TypeError("fetch failed");
    });
    await expect(netErr.client.instances.dynamicIp.rotate("vm_1")).rejects.toBeInstanceOf(APIConnectionError);
    expect(netErr.calls).toHaveLength(1);
  });

  it("still retries rotate on 429, since nothing ran", async () => {
    const rotated = sampleDynamicIp({ on_demand: true, current_address: "198.51.100.77", on_demand_used: 1 });
    const { client, calls } = mockClient((_, i) =>
      i === 0 ? json(429, { code: "RATE_LIMITED" }, retryNow) : json(200, rotated),
    );
    await expect(client.instances.dynamicIp.rotate("vm_1")).resolves.toEqual(rotated);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.headers.get("idempotency-key")).toBe(calls[1]?.headers.get("idempotency-key"));
  });

  it("passes address_rotation when creating an instance", async () => {
    const { client, calls } = mockClient(() =>
      json(202, { order_id: "ord_1", instance_id: "vm_1", status: "pending" }),
    );
    await client.instances.create({
      name: "web-1",
      plan_slug: "starter",
      image_slug: "ubuntu-24-04",
      ssh_key_id: "sshk_1",
      security_group_id: "sg_1",
      address_rotation: { schedule: "weekly", connections: "keep" },
    });
    expect(calls).toHaveLength(1);
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/instances");
    expect(calls[0]?.body).toEqual({
      name: "web-1",
      plan_slug: "starter",
      image_slug: "ubuntu-24-04",
      ssh_key_id: "sshk_1",
      security_group_id: "sg_1",
      address_rotation: { schedule: "weekly", connections: "keep" },
    });
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
  });
});
