import { describe, expect, it } from "vitest";
import { OperationFailedError, OrderFailedError, PantechError, WaitTimeoutError } from "../src/index.ts";
import { json, mockClient } from "./helpers.ts";

const op = (status: string, extra: Record<string, unknown> = {}) =>
  json(200, { id: "op_1", resource_type: "instance", resource_id: "vm_1", kind: "stop_instance", status, ...extra });

describe("operations.wait", () => {
  it("polls until the operation succeeds", async () => {
    const states = ["submitting", "submitted", "succeeded"];
    const { client, calls } = mockClient((_, i) => op(states[i] as string));
    const seen: string[] = [];
    const done = await client.operations.wait("op_1", { pollIntervalMs: 1, onUpdate: (o) => seen.push(o.status) });
    expect(done.status).toBe("succeeded");
    expect(seen).toEqual(states);
    expect(calls.every((c) => c.url.pathname === "/public/v1/operations/op_1")).toBe(true);
  });

  it("accepts a 202 body", async () => {
    const { client } = mockClient(() => op("succeeded"));
    const accepted = { operation_id: "op_1", resource_id: "vm_1", status: "submitting" };
    await expect(client.operations.wait(accepted)).resolves.toMatchObject({ id: "op_1" });
  });

  it("rejects with the failure when the operation fails", async () => {
    const { client } = mockClient(() =>
      op("failed", {
        failure: { code: "INSTANCE_BUSY", reason: "The instance kept changing. Retry when it has settled." },
      }),
    );
    const err = await client.operations.wait("op_1", { pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(OperationFailedError);
    expect(err.code).toBe("INSTANCE_BUSY");
    expect(err.detail).toBe("The instance kept changing. Retry when it has settled.");
    expect(err.operation.id).toBe("op_1");
  });

  it("gives up after timeoutMs", async () => {
    const { client } = mockClient(() => op("submitted"));
    await expect(client.operations.wait("op_1", { timeoutMs: 30, pollIntervalMs: 10 })).rejects.toBeInstanceOf(
      WaitTimeoutError,
    );
  });

  it("stops when the signal aborts", async () => {
    const { client } = mockClient(() => op("submitted"));
    const controller = new AbortController();
    const pending = client.operations.wait("op_1", { pollIntervalMs: 1_000, signal: controller.signal });
    setTimeout(() => controller.abort(new Error("stop")), 20);
    await expect(pending).rejects.toThrow("stop");
  });

  it("refuses a body without an operation", () => {
    const { client } = mockClient(() => op("succeeded"));
    expect(() => client.operations.wait({ operation_id: null })).toThrow(PantechError);
  });
});

describe("order waiting", () => {
  it("waits for an instance order and its create operation", async () => {
    const orders = ["awaiting_payment", "paid", "provisioning", "provisioned"];
    let o = 0;
    let p = 0;
    const { client, calls } = mockClient((call) => {
      if (call.url.pathname.startsWith("/public/v1/instance-orders/")) {
        const status = orders[Math.min(o++, orders.length - 1)];
        return json(200, {
          id: "ord_1",
          instance_id: "vm_1",
          status,
          operation_id: status === "provisioned" || status === "provisioning" ? "op_9" : null,
          amount_minor: 100,
          currency: "USD",
        });
      }
      return op(p++ === 0 ? "submitted" : "succeeded");
    });
    const order = await client.instanceOrders.wait({ order_id: "ord_1" }, { pollIntervalMs: 1 });
    expect(order.status).toBe("provisioned");
    expect(calls.filter((c) => c.url.pathname === "/public/v1/operations/op_9")).toHaveLength(2);
  });

  it("rejects when payment fails", async () => {
    const { client } = mockClient(() =>
      json(200, { id: "ord_1", database_id: "db_1", status: "payment_failed", failure_code: "card_declined" }),
    );
    const err = await client.databaseOrders.wait("ord_1", { pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(OrderFailedError);
    expect(err.code).toBe("card_declined");
    expect(err.order.id).toBe("ord_1");
  });

  it("can skip the create operation", async () => {
    const { client, calls } = mockClient(() =>
      json(200, { id: "ord_1", database_id: "db_1", status: "provisioned", operation_id: "op_1" }),
    );
    await client.databaseOrders.wait("ord_1", { waitForOperation: false });
    expect(calls).toHaveLength(1);
  });
});

describe("operations.stream", () => {
  const sse = (text: string) => new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });

  it("yields each change until the operation finishes", async () => {
    const body =
      ": keepalive\n\n" +
      'event: operation\ndata: {"id":"op_1","status":"submitted"}\n\n' +
      ": keepalive\n\n" +
      'event: operation\ndata: {"id":"op_1","status":"succeeded"}\n\n' +
      'event: operation\ndata: {"id":"op_1","status":"ignored"}\n\n';
    const { client, calls } = mockClient(() => sse(body));
    const statuses: string[] = [];
    for await (const o of client.operations.stream("op_1")) statuses.push(o.status);
    expect(statuses).toEqual(["submitted", "succeeded"]);
    expect(calls[0]?.headers.get("accept")).toBe("text/event-stream");
    expect(calls[0]?.url.pathname).toBe("/public/v1/operations/op_1/events");
  });

  it("rejects with the code of an error event", async () => {
    const { client } = mockClient(() =>
      sse('event: error\ndata: {"code":"OPERATION_STREAM_TIMEOUT","detail":"Reconnect.","request_id":"req_2"}\n\n'),
    );
    const err = await (async () => {
      for await (const _ of client.operations.stream("op_1")) {
        // nothing
      }
    })().catch((e) => e);
    expect(err).toBeInstanceOf(PantechError);
    expect(err.code).toBe("OPERATION_STREAM_TIMEOUT");
    expect(err.requestId).toBe("req_2");
  });
});
