import { describe, expect, it } from "vitest";
import { CloudFailedError, WaitTimeoutError } from "../src/index.ts";
import { json, mockClient } from "./helpers.ts";

const connection = (status: string, failure: unknown = null) =>
  json(200, {
    id: "cc_1",
    provider: "aws",
    name: "Production",
    status,
    failure,
    role_arn: null,
    aws_account_id: null,
    verified_at: null,
    created_at: "2026-10-27T10:00:00Z",
    updated_at: "2026-10-27T10:00:00Z",
    setup: {
      issuer_url: "https://id.example.test",
      audience: "aud",
      subject: "cc_1",
      quick_create_url: "https://console.example.test/stack",
      template: "{}",
    },
  });

const scan = (status: string, extra: Record<string, unknown> = {}) =>
  json(200, { id: "cs_1", connection_id: "cc_1", status, failure: null, ...extra });

describe("migrate.connections", () => {
  it("creates a connection with an Idempotency-Key", async () => {
    const { client, calls } = mockClient(() => connection("awaiting_role"));
    const conn = await client.migrate.connections.create({ name: "Production" });
    expect(conn.setup.quick_create_url).toBe("https://console.example.test/stack");
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/cloud-connections");
    expect(calls[0]?.body).toEqual({ name: "Production" });
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
  });

  it("sends only the role ARN on update", async () => {
    const { client, calls } = mockClient(() => connection("verifying"));
    const arn = "arn:aws:iam::123456789012:role/PantechMigrateReadOnly";
    await client.migrate.connections.update("cc_1", { role_arn: arn });
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("PATCH /public/v1/cloud-connections/cc_1");
    expect(calls[0]?.body).toEqual({ role_arn: arn });
  });

  it("waits until the connection is connected", async () => {
    const states = ["verifying", "verifying", "connected"];
    const { client, calls } = mockClient((_, i) => connection(states[i] as string));
    const conn = await client.migrate.connections.wait("cc_1", { pollIntervalMs: 1 });
    expect(conn.status).toBe("connected");
    expect(calls).toHaveLength(3);
  });

  it("rejects with the failure when the check fails", async () => {
    const { client } = mockClient(() =>
      connection("failed", { code: "assume_role_denied", message: "Check the role's trust policy." }),
    );
    const err = await client.migrate.connections.wait("cc_1", { pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(CloudFailedError);
    expect(err.kind).toBe("connection");
    expect(err.code).toBe("assume_role_denied");
    expect(err.detail).toBe("Check the role's trust policy.");
  });
});

describe("migrate.scans", () => {
  it("asks for the inventory", async () => {
    const { client, calls } = mockClient(() => scan("succeeded", { inventory: { instances: [] } }));
    await client.migrate.scans.get("cs_1", { include: "inventory" });
    expect(calls[0]?.url.pathname).toBe("/public/v1/cloud-scans/cs_1");
    expect(calls[0]?.url.searchParams.get("include")).toBe("inventory");
  });

  it("starts a scan without a body", async () => {
    const { client, calls } = mockClient(() => scan("queued"));
    await client.migrate.scans.start("cc_1");
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/cloud-connections/cc_1/scans");
    expect(calls[0]?.body).toBeUndefined();
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
  });

  it("waits until the scan succeeds, without asking for the inventory", async () => {
    const states = ["queued", "running", "succeeded"];
    const { client, calls } = mockClient((_, i) => scan(states[i] as string));
    const done = await client.migrate.scans.wait("cs_1", { pollIntervalMs: 1 });
    expect(done.status).toBe("succeeded");
    expect(calls.every((c) => c.url.search === "")).toBe(true);
  });

  it("rejects when the scan fails", async () => {
    const { client } = mockClient(() =>
      scan("failed", { failure: { code: "scan_too_large", message: "Too much to read." } }),
    );
    const err = await client.migrate.scans.wait("cs_1", { pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(CloudFailedError);
    expect(err.kind).toBe("scan");
    expect(err.code).toBe("scan_too_large");
  });

  it("gives up after timeoutMs", async () => {
    const { client } = mockClient(() => scan("running"));
    await expect(client.migrate.scans.wait("cs_1", { timeoutMs: 30, pollIntervalMs: 10 })).rejects.toBeInstanceOf(
      WaitTimeoutError,
    );
  });
});

describe("migrate.migrations", () => {
  it("changes one item and returns the plan", async () => {
    const { client, calls } = mockClient(() =>
      json(200, { id: "mig_1", summary: { planned: 1, excluded: 1, unsupported: 0, by_kind: {} } }),
    );
    const plan = await client.migrate.migrations.updateItem("mig_1", {
      key: "volume:us-east-1:vol-1",
      excluded: true,
    });
    expect(plan.summary.excluded).toBe(1);
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("PATCH /public/v1/migrations/mig_1/items");
    expect(calls[0]?.body).toEqual({ key: "volume:us-east-1:vol-1", excluded: true });
  });

  it("exports Terraform files", async () => {
    const { client, calls } = mockClient(() => json(200, { files: [{ name: "main.tf", content: "terraform {}\n" }] }));
    const tf = await client.migrate.migrations.exportTerraform("mig_1");
    expect(tf.files[0]?.name).toBe("main.tf");
    expect(calls[0]?.url.pathname).toBe("/public/v1/migrations/mig_1/terraform");
  });
});
