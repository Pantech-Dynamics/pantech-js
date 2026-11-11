import { describe, expect, it } from "vitest";
import {
  ConflictError,
  DOMAIN_ERROR_CODES,
  type DomainContact,
  OrderFailedError,
  PaymentRequiredError,
} from "../src/index.ts";
import { json, mockClient, problem } from "./helpers.ts";

const contact: DomainContact = {
  type: "person",
  first_name: "Ada",
  last_name: "Obi",
  email: "ada@example.com",
  phone: "+234.8012345678",
  organization_name: "",
  address_line1: "1 Marina",
  address_line2: "",
  city: "Lagos",
  state: "Lagos",
  country_code: "NG",
  postal_code: "101001",
};

const order = (status: string, extra: Record<string, unknown> = {}) => ({
  id: "dor_1",
  domain_id: "dom_1",
  domain_name: "example.com",
  kind: "register",
  years: 1,
  amount_minor: 1500,
  currency: "USD",
  status,
  failure_code: null,
  refunded: false,
  created_at: "2026-11-10T10:04:41Z",
  completed_at: null,
  ...extra,
});

describe("domains", () => {
  it("searches by query", async () => {
    const { client, calls } = mockClient(() =>
      json(200, { data: [{ name: "example.com", tld: "com", status: "available", price: null }] }),
    );
    const res = await client.domains.search({ query: "example" });
    expect(res.data[0]?.status).toBe("available");
    expect(calls[0]?.url.pathname).toBe("/public/v1/domains/search");
    expect(calls[0]?.url.searchParams.get("query")).toBe("example");
  });

  it("checks a transfer", async () => {
    const { client, calls } = mockClient(() =>
      json(200, { name: "example.com", transferable: true, reason: null, price: null }),
    );
    await client.domains.checkTransfer({ name: "example.com" });
    expect(calls[0]?.url.pathname).toBe("/public/v1/domains/transfer-check");
    expect(calls[0]?.url.searchParams.get("name")).toBe("example.com");
  });

  it("registers with one Idempotency-Key, reused by a retry", async () => {
    const { client, calls } = mockClient((_, i) =>
      i === 0
        ? problem(503, "SERVICE_UNAVAILABLE", "Try again.")
        : json(202, { domain: { id: "dom_1" }, order: order("pending") }),
    );
    const res = await client.domains.register({ name: "example.com", years: 2, contact, accept_terms: true });
    expect(res.order.id).toBe("dor_1");
    expect(calls).toHaveLength(2);
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/domains");
    expect(calls[0]?.body).toEqual({ name: "example.com", years: 2, contact, accept_terms: true });
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
    expect(calls[1]?.headers.get("idempotency-key")).toBe(calls[0]?.headers.get("idempotency-key"));
  });

  it("sends settings, name servers, contact and renewals to their routes", async () => {
    const { client, calls } = mockClient(() => json(200, { id: "dom_1" }));
    await client.domains.update("dom_1", { auto_renew: false });
    await client.domains.setNameServers("dom_1", { use_pantech_dns: false, name_servers: ["ns1.example.net"] });
    await client.domains.updateContact("dom_1", { contact });
    await client.domains.renew("dom_1", { years: 3 });
    await client.domains.renew("dom_1");
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "PATCH /public/v1/domains/dom_1",
      "PUT /public/v1/domains/dom_1/name-servers",
      "PUT /public/v1/domains/dom_1/contact",
      "POST /public/v1/domains/dom_1/renew",
      "POST /public/v1/domains/dom_1/renew",
    ]);
    expect(calls[1]?.body).toEqual({ use_pantech_dns: false, name_servers: ["ns1.example.net"] });
    expect(calls[3]?.body).toEqual({ years: 3 });
    expect(calls[4]?.body).toEqual({});
  });

  it("reads the auth code, pending then ready", async () => {
    const { client } = mockClient((_, i) =>
      i === 0
        ? json(202, { status: "pending" })
        : json(200, { auth_code: "abc-123", expires_at: "2026-11-11T10:00:00Z" }),
    );
    const first = await client.domains.getAuthCode("dom_1");
    expect("status" in first && first.status).toBe("pending");
    const second = await client.domains.getAuthCode("dom_1");
    expect("auth_code" in second && second.auth_code).toBe("abc-123");
  });

  it("types the domain problem codes", async () => {
    const { client } = mockClient(() => problem(409, "DOMAIN_LOCKED", "Turn the transfer lock off first."));
    const err = await client.domains.requestAuthCode("dom_1").catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(DOMAIN_ERROR_CODES).toContain(err.code);
  });
});

describe("domains.orders", () => {
  it("lists a domain's orders and gets one", async () => {
    const { client, calls } = mockClient(() => json(200, { data: [] }));
    await client.domains.orders.list("dom_1");
    await client.domains.orders.get("dor_1");
    expect(calls.map((c) => c.url.pathname)).toEqual([
      "/public/v1/domains/dom_1/orders",
      "/public/v1/domain-orders/dor_1",
    ]);
  });

  it("retries a payment with the Idempotency-Key given", async () => {
    const { client, calls } = mockClient(() =>
      json(202, order("awaiting_payment", { payment_url: null, payment_expires_at: "2026-11-10T12:00:00Z" })),
    );
    const res = await client.domains.orders.retryPayment("dor_1", { idempotencyKey: "retry-1" });
    expect(res.status).toBe("awaiting_payment");
    expect(res.payment_expires_at).toBe("2026-11-10T12:00:00Z");
    expect(calls).toHaveLength(1);
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/domain-orders/dor_1/retry-payment");
    expect(calls[0]?.headers.get("idempotency-key")).toBe("retry-1");
  });

  it("surfaces DOMAIN_ORDER_NOT_AWAITING_PAYMENT", async () => {
    const { client, calls } = mockClient(() =>
      problem(409, "DOMAIN_ORDER_NOT_AWAITING_PAYMENT", "The order is not waiting for a payment."),
    );
    const err = await client.domains.orders.retryPayment("dor_1").catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.code).toBe("DOMAIN_ORDER_NOT_AWAITING_PAYMENT");
    expect(DOMAIN_ERROR_CODES).toContain(err.code);
    expect(calls).toHaveLength(1);
  });

  it("waits for the order from the register response", async () => {
    const states = ["paid", "submitted", "succeeded"];
    const { client, calls } = mockClient((_, i) => json(200, order(states[i] as string)));
    const done = await client.domains.orders.wait({ order: { id: "dor_1" } }, { pollIntervalMs: 1 });
    expect(done.status).toBe("succeeded");
    expect(calls).toHaveLength(3);
  });

  it("rejects with OrderFailedError when the order fails", async () => {
    const { client } = mockClient(() =>
      json(200, order("failed", { failure_code: "insufficient_credit", refunded: true })),
    );
    const err = await client.domains.orders.wait("dor_1", { pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(OrderFailedError);
    expect(err.code).toBe("insufficient_credit");
    expect(err.message).toContain("returned to your credit");
  });
});

describe("domain order payment", () => {
  it("rejects with PaymentRequiredError carrying the payment link", async () => {
    const { client } = mockClient((_, i) =>
      json(
        200,
        i === 0
          ? order("pending")
          : order("awaiting_payment", {
              payment_url: "https://pay.example.test/c/1",
              payment_expires_at: "2026-11-10T11:00:00Z",
            }),
      ),
    );
    const err = await client.domains.orders.wait("dor_1", { pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentRequiredError);
    expect(err.code).toBe("AWAITING_PAYMENT");
    expect(err.paymentUrl).toBe("https://pay.example.test/c/1");
    expect(err.paymentExpiresAt).toBe("2026-11-10T11:00:00Z");
    expect(err.order.id).toBe("dor_1");
    expect(err.message).not.toContain("pay.example.test");
  });

  it("rejects without a payment link when no confirmation is needed", async () => {
    const { client } = mockClient(() => json(200, order("awaiting_payment", { payment_url: null })));
    const err = await client.domains.orders.wait("dor_1", { pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentRequiredError);
    expect(err.paymentUrl).toBeUndefined();
    expect(err.message).not.toContain("paymentUrl");
  });

  it("waits through the payment when asked", async () => {
    const states = ["awaiting_payment", "paid", "succeeded"];
    const { client } = mockClient((_, i) => json(200, order(states[i] as string)));
    const done = await client.domains.orders.wait("dor_1", { pollIntervalMs: 1, waitForPayment: true });
    expect(done.status).toBe("succeeded");
  });

  it("fails insufficient_credit when the payment window ends", async () => {
    const { client } = mockClient((_, i) =>
      json(200, i === 0 ? order("awaiting_payment") : order("failed", { failure_code: "insufficient_credit" })),
    );
    const err = await client.domains.orders.wait("dor_1", { pollIntervalMs: 1, waitForPayment: true }).catch((e) => e);
    expect(err).toBeInstanceOf(OrderFailedError);
    expect(err.code).toBe("insufficient_credit");
  });

  it("surfaces PRIVACY_ALWAYS_ON as a field error", async () => {
    const { client } = mockClient(() =>
      problem(422, "VALIDATION_FAILED", "One or more fields are invalid.", {
        errors: [{ field: "privacy", code: "PRIVACY_ALWAYS_ON", message: "The .ng registry hides it." }],
      }),
    );
    const err = await client.domains.update("dom_1", { privacy: false }).catch((e) => e);
    expect(err.errors[0]).toEqual({
      field: "privacy",
      code: "PRIVACY_ALWAYS_ON",
      message: "The .ng registry hides it.",
    });
  });
});
