import { describe, expect, it } from "vitest";
import {
  ConflictError,
  DNS_ERROR_CODES,
  DNSFailedError,
  isPantechError,
  PreconditionFailedError,
  WaitTimeoutError,
} from "../src/index.ts";
import { json, mockClient, problem } from "./helpers.ts";

const zone = (status: string, extra: Record<string, unknown> = {}) =>
  json(200, {
    id: "dnsz_1",
    name: "example.com",
    description: "",
    status,
    failure_code: null,
    name_servers: ["ns-1.example-dns.net", "ns-2.example-dns.org"],
    domain_id: null,
    record_count: 2,
    last_checked_at: null,
    activated_at: null,
    suspended_reason: null,
    created_at: "2026-11-10T10:00:00Z",
    updated_at: "2026-11-10T10:00:00Z",
    version: 1,
    ...extra,
  });

const record = (status: string, extra: Record<string, unknown> = {}) =>
  json(202, {
    id: "dnsr_1",
    zone_id: "dnsz_1",
    name: "www",
    fqdn: "www.example.com",
    type: "A",
    ttl: 300,
    values: ["203.0.113.10"],
    allow_private: false,
    comment: "",
    managed: false,
    status,
    failure_code: null,
    version: 2,
    created_at: "2026-11-10T10:01:00Z",
    updated_at: "2026-11-10T10:01:00Z",
    ...extra,
  });

describe("dns.zones", () => {
  it("creates a zone with an Idempotency-Key", async () => {
    const { client, calls } = mockClient(() => zone("pending", { name_servers: [] }));
    const z = await client.dns.zones.create({ name: "example.com" }, { idempotencyKey: "key-1" });
    expect(z.status).toBe("pending");
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/dns/zones");
    expect(calls[0]?.body).toEqual({ name: "example.com" });
    expect(calls[0]?.headers.get("idempotency-key")).toBe("key-1");
  });

  it("lists every zone across pages, keeping the filters", async () => {
    const { client, calls } = mockClient((_, i) =>
      json(
        200,
        i === 0 ? { data: [{ id: "dnsz_1" }], next_cursor: "c2" } : { data: [{ id: "dnsz_2" }], next_cursor: null },
      ),
    );
    const ids: string[] = [];
    for await (const z of client.dns.zones.listAll({ status: "active" })) ids.push(z.id);
    expect(ids).toEqual(["dnsz_1", "dnsz_2"]);
    expect(calls[1]?.url.searchParams.get("cursor")).toBe("c2");
    expect(calls[1]?.url.searchParams.get("status")).toBe("active");
  });

  it("verifies without a body", async () => {
    const { client, calls } = mockClient(() => zone("awaiting_delegation"));
    await client.dns.zones.verify("dnsz_1");
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/dns/zones/dnsz_1/verify");
    expect(calls[0]?.body).toBeUndefined();
  });

  it("exports the zone file as text", async () => {
    const file = "$ORIGIN example.com.\nwww 300 IN A 203.0.113.10\n";
    const { client, calls } = mockClient(
      () => new Response(file, { status: 200, headers: { "content-type": "text/dns" } }),
    );
    expect(await client.dns.zones.exportZoneFile("dnsz_1")).toBe(file);
    expect(calls[0]?.url.pathname).toBe("/public/v1/dns/zones/dnsz_1/export");
    expect(calls[0]?.headers.get("accept")).toMatch(/^text\/dns/);
  });

  it("waits until the zone has its name servers", async () => {
    const states = ["pending", "awaiting_delegation"];
    const { client, calls } = mockClient((_, i) => zone(states[i] as string));
    const z = await client.dns.zones.wait("dnsz_1", { pollIntervalMs: 1 });
    expect(z.status).toBe("awaiting_delegation");
    expect(calls).toHaveLength(2);
  });

  it("rejects with DNSFailedError when the zone fails", async () => {
    const { client } = mockClient(() => zone("failed", { failure_code: "provider_rejected" }));
    const err = await client.dns.zones.wait("dnsz_1", { pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(DNSFailedError);
    expect(err.kind).toBe("zone");
    expect(err.code).toBe("provider_rejected");
  });

  it("imports a zone file", async () => {
    const { client, calls } = mockClient(() => json(202, { data: [] }));
    await client.dns.zones.importZoneFile("dnsz_1", { zone_file: "www 300 IN A 203.0.113.10", replace: true });
    expect(calls[0]?.body).toEqual({ zone_file: "www 300 IN A 203.0.113.10", replace: true });
  });

  it("types the zone's problem codes", async () => {
    const { client } = mockClient(() => problem(409, "DNS_ZONE_IN_USE_BY_DOMAIN", "A Pantech domain uses this zone."));
    const err = await client.dns.zones.delete("dnsz_1").catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(isPantechError(err, "DNS_ZONE_IN_USE_BY_DOMAIN")).toBe(true);
    expect(DNS_ERROR_CODES).toContain(err.code);
  });
});

describe("dns.records", () => {
  it("creates a record set", async () => {
    const { client, calls } = mockClient(() => record("pending"));
    await client.dns.records.create("dnsz_1", { name: "www", type: "A", values: ["203.0.113.10"], ttl: 300 });
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/dns/zones/dnsz_1/records");
    expect(calls[0]?.body).toEqual({ name: "www", type: "A", values: ["203.0.113.10"], ttl: 300 });
  });

  it("sends If-Match on update and delete", async () => {
    const { client, calls } = mockClient(() => record("pending"));
    await client.dns.records.update("dnsz_1", "dnsr_1", { ttl: 60 }, { ifMatch: 2, headers: { "X-Trace": "1" } });
    await client.dns.records.delete("dnsz_1", "dnsr_1", { ifMatch: 3 });
    expect(calls[0]?.headers.get("if-match")).toBe("2");
    expect(calls[0]?.headers.get("x-trace")).toBe("1");
    expect(calls[0]?.body).toEqual({ ttl: 60 });
    expect(`${calls[1]?.method} ${calls[1]?.headers.get("if-match")}`).toBe("DELETE 3");
  });

  it("sends no If-Match unless asked", async () => {
    const { client, calls } = mockClient(() => record("pending"));
    await client.dns.records.update("dnsz_1", "dnsr_1", { values: ["203.0.113.11"] });
    expect(calls[0]?.headers.has("if-match")).toBe(false);
  });

  it("refuses an ifMatch that is not a version", async () => {
    const { client, calls } = mockClient(() => record("pending"));
    expect(() => client.dns.records.delete("dnsz_1", "dnsr_1", { ifMatch: 1.5 })).toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });

  it("maps 412 VERSION_CONFLICT to PreconditionFailedError, without retrying", async () => {
    const { client, calls } = mockClient(() =>
      problem(412, "VERSION_CONFLICT", "The record set changed since you read it."),
    );
    const err = await client.dns.records.update("dnsz_1", "dnsr_1", { ttl: 60 }, { ifMatch: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(PreconditionFailedError);
    expect(err.code).toBe("VERSION_CONFLICT");
    expect(calls).toHaveLength(1);
  });

  it("sends a batch", async () => {
    const { client, calls } = mockClient(() => json(202, { data: [] }));
    const changes = [
      { action: "create" as const, record: { name: "api", type: "CNAME" as const, values: ["www.example.com"] } },
      { action: "delete" as const, record_id: "dnsr_2", version: 4 },
    ];
    await client.dns.records.batch("dnsz_1", { changes });
    expect(calls[0]?.url.pathname).toBe("/public/v1/dns/zones/dnsz_1/records/batch");
    expect(calls[0]?.body).toEqual({ changes });
  });

  it("waits until the record set is active", async () => {
    const states = ["pending", "pending", "active"];
    const { client, calls } = mockClient((_, i) => record(states[i] as string));
    const r = await client.dns.records.wait("dnsz_1", "dnsr_1", { pollIntervalMs: 1 });
    expect(r.status).toBe("active");
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.url.pathname === "/public/v1/dns/zones/dnsz_1/records/dnsr_1")).toBe(true);
  });

  it("rejects with DNSFailedError when the change fails", async () => {
    const { client } = mockClient(() => record("failed", { failure_code: "invalid_change" }));
    const err = await client.dns.records.wait("dnsz_1", "dnsr_1", { pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(DNSFailedError);
    expect(err.kind).toBe("record");
    expect(err.code).toBe("invalid_change");
    expect(err.message).toContain("www.example.com");
  });

  it("gives up after timeoutMs", async () => {
    const { client } = mockClient(() => record("pending"));
    await expect(
      client.dns.records.wait("dnsz_1", "dnsr_1", { timeoutMs: 30, pollIntervalMs: 10 }),
    ).rejects.toBeInstanceOf(WaitTimeoutError);
  });
});

describe("dns.zones.quote and https load balancers", () => {
  it("quotes zones", async () => {
    const { client, calls } = mockClient(() =>
      json(200, { free_zones: 5, live_zones: 7, billable_zones: 2, monthly_per_zone_minor: 50, currency: "USD" }),
    );
    expect((await client.dns.zones.quote()).free_zones).toBe(5);
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("GET /public/v1/dns/zones/quote");
  });

  it("sends the https fields of a load balancer", async () => {
    const { client, calls } = mockClient(() => json(200, { id: "lb_1", protocol: "https" }));
    await client.loadBalancers.update("lb_1", { certificate_id: "cert_1", tls_policy: "tls13", redirect_http: true });
    expect(calls[0]?.body).toEqual({ certificate_id: "cert_1", tls_policy: "tls13", redirect_http: true });
  });
});
