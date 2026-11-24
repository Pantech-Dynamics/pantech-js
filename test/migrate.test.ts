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

describe("migrate.providers and agent connections", () => {
  it("lists the clouds Migrate can read", async () => {
    const { client, calls } = mockClient(() =>
      json(200, {
        data: [
          {
            slug: "gcp",
            name: "Google Cloud",
            access: "federated",
            cost_readable: true,
            people_readable: true,
            available: true,
          },
          {
            slug: "hetzner",
            name: "Hetzner",
            access: "agent",
            cost_readable: false,
            people_readable: false,
            available: true,
          },
        ],
        next_cursor: null,
      }),
    );
    const providers = await client.migrate.providers.list();
    expect(providers.data.map((p) => p.access)).toEqual(["federated", "agent"]);
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("GET /public/v1/cloud-providers");
  });

  it("creates a connection to another provider", async () => {
    const { client, calls } = mockClient(() => connection("awaiting_agent"));
    await client.migrate.connections.create({ provider: "hetzner", name: "Hetzner" });
    expect(calls[0]?.body).toEqual({ provider: "hetzner", name: "Hetzner" });
  });

  it("enrolls an agent once, without retrying, since each call issues a new code", async () => {
    const { client, calls } = mockClient(() =>
      json(201, { code: "ENR-1", expires_at: "2026-11-25T11:00:00Z", enroll_command: "pantech-migrate enroll ENR-1" }),
    );
    const enrollment = await client.migrate.connections.enrollAgent("cc_1");
    expect(enrollment.enroll_command).toContain("enroll");
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe(
      "POST /public/v1/cloud-connections/cc_1/agent-enrollments",
    );
    expect(calls[0]?.body).toBeUndefined();
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
  });

  it("revokes a connection's agent", async () => {
    const { client, calls } = mockClient(() => connection("awaiting_agent"));
    const conn = await client.migrate.connections.revokeAgent("cc_1");
    expect(conn.status).toBe("awaiting_agent");
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("DELETE /public/v1/cloud-connections/cc_1/agent");
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
  });

  it("sends a plan's invites by key", async () => {
    const { client, calls } = mockClient(() =>
      json(200, { results: [{ key: "user:alice", outcome: "invited" }], migration: { id: "mig_1" } }),
    );
    await client.migrate.migrations.sendInvites("mig_1", { keys: ["user:alice"] });
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/migrations/mig_1/invites");
    expect(calls[0]?.body).toEqual({ keys: ["user:alice"] });
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
  });
});

describe("migrate.copyAccess and migrate.bucketImports", () => {
  it("chooses the buckets to copy", async () => {
    const { client, calls } = mockClient(() => json(200, { connection_id: "cc_1", status: "awaiting_role" }));
    await client.migrate.copyAccess.set("cc_1", { buckets: ["assets", "logs"] });
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("PUT /public/v1/cloud-connections/cc_1/copy-access");
    expect(calls[0]?.body).toEqual({ buckets: ["assets", "logs"] });
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
  });

  it("reads copy access", async () => {
    const { client, calls } = mockClient(() => json(200, { connection_id: "cc_1", status: "verified" }));
    const access = await client.migrate.copyAccess.get("cc_1");
    expect(access.status).toBe("verified");
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("GET /public/v1/cloud-connections/cc_1/copy-access");
  });

  it("starts an import into a new bucket", async () => {
    const { client, calls } = mockClient(() => json(202, { id: "bim_1", status: "queued" }));
    const started = await client.migrate.bucketImports.start({
      connection_id: "cc_1",
      source_bucket: "assets",
      destination_bucket_name: "assets",
    });
    expect(started.status).toBe("queued");
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/bucket-imports");
    expect(calls[0]?.body).toEqual({
      connection_id: "cc_1",
      source_bucket: "assets",
      destination_bucket_name: "assets",
    });
  });

  it("resyncs with an empty body by default, or mirrors deletes when asked", async () => {
    const { client, calls } = mockClient(() => json(202, { id: "bim_1", status: "queued" }));
    await client.migrate.bucketImports.resync("bim_1");
    await client.migrate.bucketImports.resync("bim_1", { mirror_deletes: true });
    expect(calls[0]?.url.pathname).toBe("/public/v1/bucket-imports/bim_1/resync");
    expect(calls[0]?.body).toEqual({});
    expect(calls[1]?.body).toEqual({ mirror_deletes: true });
  });

  it("pages through every import", async () => {
    const pages = [
      { data: [{ id: "bim_1" }], next_cursor: "c2" },
      { data: [{ id: "bim_2" }], next_cursor: null },
    ];
    const { client, calls } = mockClient((_, i) => json(200, pages[i]));
    const ids: string[] = [];
    for await (const imp of client.migrate.bucketImports.listAll()) ids.push(imp.id);
    expect(ids).toEqual(["bim_1", "bim_2"]);
    expect(calls[1]?.url.searchParams.get("cursor")).toBe("c2");
  });
});

describe("migrate.serverCopies", () => {
  it("starts a copy from a plan", async () => {
    const { client, calls } = mockClient(() => json(201, { id: "scp_1", status: "waiting" }));
    await client.migrate.serverCopies.start("mig_1", { item_key: "instance:us-east-1:i-1", subnet_id: "sn_1" });
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/migrations/mig_1/server-copies");
    expect(calls[0]?.body).toEqual({ item_key: "instance:us-east-1:i-1", subnet_id: "sn_1" });
  });

  it("asks for the AWS copy role template of one server", async () => {
    const { client, calls } = mockClient(() => json(200, { template: "{}" }));
    await client.migrate.serverCopies.getTemplate("mig_1", {
      item_key: "instance:us-east-1:i-1",
      create_snapshots: true,
    });
    expect(calls[0]?.url.pathname).toBe("/public/v1/migrations/mig_1/server-copy-template");
    expect(calls[0]?.url.searchParams.get("item_key")).toBe("instance:us-east-1:i-1");
    expect(calls[0]?.url.searchParams.get("create_snapshots")).toBe("true");
  });

  it("syncs, cuts over and cancels with an Idempotency-Key", async () => {
    const { client, calls } = mockClient(() => json(202, { id: "scp_1", status: "copying" }));
    await client.migrate.serverCopies.sync("scp_1", { snapshots: { "vol-1": "snap-2" } });
    await client.migrate.serverCopies.cutOver("scp_1");
    await client.migrate.serverCopies.cancel("scp_1");
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "POST /public/v1/server-copies/scp_1/sync",
      "POST /public/v1/server-copies/scp_1/cutover",
      "POST /public/v1/server-copies/scp_1/cancel",
    ]);
    expect(calls[0]?.body).toEqual({ snapshots: { "vol-1": "snap-2" } });
    expect(calls.every((c) => c.headers.get("idempotency-key"))).toBe(true);
  });
});

describe("migrate.databaseImports", () => {
  it("starts an import through the agent", async () => {
    const { client, calls } = mockClient(() => json(201, { id: "dbi_1", status: "awaiting_agent" }));
    await client.migrate.databaseImports.start("mig_1", {
      item_key: "database:us-east-1:orders",
      destination_database_id: "db_1",
      source_ref: "prod-db",
      mode: "replicate",
    });
    expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe("POST /public/v1/migrations/mig_1/database-imports");
    expect(calls[0]?.body).toMatchObject({ source_ref: "prod-db", mode: "replicate" });
  });

  it("checks readiness, cuts over, cancels and revokes access without a body", async () => {
    const { client, calls } = mockClient(() => json(202, { id: "dbi_1", status: "ready" }));
    await client.migrate.databaseImports.checkReadiness("dbi_1");
    await client.migrate.databaseImports.cutOver("dbi_1");
    await client.migrate.databaseImports.cancel("dbi_1");
    await client.migrate.databaseImports.revokeAccess("dbi_1");
    expect(calls.map((c) => c.url.pathname)).toEqual([
      "/public/v1/database-imports/dbi_1/readiness",
      "/public/v1/database-imports/dbi_1/cutover",
      "/public/v1/database-imports/dbi_1/cancel",
      "/public/v1/database-imports/dbi_1/revoke-access",
    ]);
    expect(calls.every((c) => c.method === "POST" && c.body === undefined)).toBe(true);
  });
});

describe("migrate.kubernetesMoves", () => {
  it("starts, previews, applies and cuts over a move", async () => {
    const { client, calls } = mockClient(() => json(202, { id: "kmv_1", status: "exporting" }));
    await client.migrate.kubernetesMoves.start("mig_1", {
      item_key: "kubernetes_cluster:us-east-1:prod",
      cluster_id: "k8s_1",
      copy_volumes: true,
    });
    await client.migrate.kubernetesMoves.preview("kmv_1", {
      allow_privileged: [{ group: "apps", kind: "DaemonSet", namespace: "kube-system", name: "agent" }],
    });
    await client.migrate.kubernetesMoves.apply("kmv_1");
    await client.migrate.kubernetesMoves.syncVolumes("kmv_1");
    await client.migrate.kubernetesMoves.cutOver("kmv_1", { source_writes_stopped: true });
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "POST /public/v1/migrations/mig_1/kubernetes-moves",
      "POST /public/v1/kubernetes-moves/kmv_1/preview",
      "POST /public/v1/kubernetes-moves/kmv_1/apply",
      "POST /public/v1/kubernetes-moves/kmv_1/sync-volumes",
      "POST /public/v1/kubernetes-moves/kmv_1/cutover",
    ]);
    expect(calls[4]?.body).toEqual({ source_writes_stopped: true });
  });

  it("downloads the manifests as YAML text", async () => {
    const yaml = "apiVersion: v1\nkind: Namespace\n";
    const { client, calls } = mockClient(
      () => new Response(yaml, { status: 200, headers: { "content-type": "application/yaml" } }),
    );
    const text = await client.migrate.kubernetesMoves.downloadManifests("kmv_1");
    expect(text).toBe(yaml);
    expect(calls[0]?.url.pathname).toBe("/public/v1/kubernetes-moves/kmv_1/manifests");
    expect(calls[0]?.headers.get("accept")).toBe("application/yaml");
  });

  it("reads the source access manifests", async () => {
    const { client, calls } = mockClient(() => json(200, { reader: "kind: ClusterRole\n" }));
    await client.migrate.kubernetesMoves.getSourceAccess();
    expect(calls[0]?.url.pathname).toBe("/public/v1/kubernetes-moves/source-access");
  });
});
