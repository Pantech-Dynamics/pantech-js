import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_ERROR_CODES,
  CertificateFailedError,
  ConflictError,
  RateLimitError,
  WaitTimeoutError,
} from "../src/index.ts";
import { json, mockClient, problem } from "./helpers.ts";

const KEY = "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGSECRETKEYMATERIAL\n-----END PRIVATE KEY-----\n";
const CERT = "-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIU\n-----END CERTIFICATE-----\n";

const certificate = (status: string, extra: Record<string, unknown> = {}) =>
  json(200, {
    id: "cert_1",
    kind: "public",
    names: ["example.com", "*.example.com"],
    common_name: "example.com",
    status,
    failure_code: null,
    validations: [],
    in_use_by: [],
    ...extra,
  });

describe("certificates", () => {
  it("requests a certificate with an Idempotency-Key", async () => {
    const { client, calls } = mockClient(() => certificate("pending_validation"));
    await client.certificates.request({ names: ["example.com", "*.example.com"], exportable: true });
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/certificates");
    expect(calls[0]?.body).toEqual({ names: ["example.com", "*.example.com"], exportable: true });
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
  });

  it("filters the list", async () => {
    const { client, calls } = mockClient(() => json(200, { data: [], next_cursor: null }));
    await client.certificates.list({ status: "issued", kind: "imported", q: "example" });
    const p = calls[0]?.url.searchParams;
    expect([p?.get("status"), p?.get("kind"), p?.get("q")]).toEqual(["issued", "imported", "example"]);
  });

  it("waits until issued", async () => {
    const states = ["pending_validation", "issuing", "issued"];
    const { client, calls } = mockClient((_, i) => certificate(states[i] as string));
    const cert = await client.certificates.wait("cert_1", { pollIntervalMs: 1 });
    expect(cert.status).toBe("issued");
    expect(calls).toHaveLength(3);
  });

  it("rejects with CertificateFailedError when it fails, is revoked or expires", async () => {
    for (const [status, failure, code] of [
      ["failed", "caa_forbidden", "caa_forbidden"],
      ["revoked", null, "revoked"],
      ["expired", null, "expired"],
    ] as const) {
      const { client } = mockClient(() => certificate(status, { failure_code: failure }));
      const err = await client.certificates.wait("cert_1", { pollIntervalMs: 1 }).catch((e) => e);
      expect(err).toBeInstanceOf(CertificateFailedError);
      expect(err.code).toBe(code);
      expect(err.message).toContain("example.com");
    }
  });

  it("gives up after timeoutMs", async () => {
    const { client } = mockClient(() => certificate("pending_validation"));
    await expect(client.certificates.wait("cert_1", { timeoutMs: 30, pollIntervalMs: 10 })).rejects.toBeInstanceOf(
      WaitTimeoutError,
    );
  });

  it("exports the key but keeps it out of logs and JSON", async () => {
    const { client, calls } = mockClient(() =>
      json(200, { certificate_pem: CERT, chain_pem: "", private_key_pem: KEY, not_after: "2027-02-08T10:00:00Z" }),
    );
    const exported = await client.certificates.export("cert_1");
    expect(exported.private_key_pem).toBe(KEY);
    expect(exported.certificate_pem).toBe(CERT);
    expect(inspect(exported)).not.toContain("SECRETKEYMATERIAL");
    expect(JSON.stringify(exported)).not.toContain("SECRETKEYMATERIAL");
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/certificates/cert_1/export");
  });

  it("imports, reimports, verifies and revokes", async () => {
    const { client, calls } = mockClient(() => certificate("issued", { kind: "imported" }));
    await client.certificates.import({ certificate_pem: CERT, private_key_pem: KEY, description: "legacy" });
    await client.certificates.reimport("cert_1", { certificate_pem: CERT, private_key_pem: KEY });
    await client.certificates.verify("cert_1");
    await client.certificates.revoke("cert_1", { reason: "key_compromise" });
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "POST /public/v1/certificates/import",
      "POST /public/v1/certificates/cert_1/reimport",
      "POST /public/v1/certificates/cert_1/verify",
      "POST /public/v1/certificates/cert_1/revoke",
    ]);
    expect(calls[3]?.body).toEqual({ reason: "key_compromise" });
  });

  it("never puts an imported key in an error", async () => {
    const { client } = mockClient(() =>
      problem(422, "VALIDATION_FAILED", "One or more fields are invalid.", {
        errors: [
          { field: "private_key_pem", code: "KEY_MISMATCH", message: "The key does not match the certificate." },
        ],
      }),
    );
    const err = await client.certificates.import({ certificate_pem: CERT, private_key_pem: KEY }).catch((e) => e);
    expect(inspect(err)).not.toContain("SECRETKEYMATERIAL");
    expect(err.errors[0].code).toBe("KEY_MISMATCH");
  });

  it("types the certificate codes", async () => {
    const { client } = mockClient(() => problem(409, "CERTIFICATE_IN_USE", "A load balancer uses it."));
    const err = await client.certificates.delete("cert_1").catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(CERTIFICATE_ERROR_CODES).toContain(err.code);
    expect(CERTIFICATE_ERROR_CODES).toHaveLength(13);
  });

  it("retries CERTIFICATE_RATE_LIMITED with the same key, then rejects", async () => {
    const { client, calls } = mockClient(
      () =>
        new Response(JSON.stringify({ code: "CERTIFICATE_RATE_LIMITED", detail: "Requested 5 times this week." }), {
          status: 429,
          headers: { "content-type": "application/problem+json", "retry-after": "0" },
        }),
      { maxRetries: 1 },
    );
    const err = await client.certificates.request({ names: ["example.com"] }).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.code).toBe("CERTIFICATE_RATE_LIMITED");
    expect(calls).toHaveLength(2);
    expect(calls[1]?.headers.get("idempotency-key")).toBe(calls[0]?.headers.get("idempotency-key"));
  });
});
