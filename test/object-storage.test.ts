import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { APIConnectionError, InternalServerError } from "../src/index.ts";
import { json, mockClient } from "./helpers.ts";

const retryNow = { "retry-after": "0" };

describe("object storage and buckets", () => {
  it("reads status, usage, and manages access keys with hidden secret_access_key", async () => {
    const secret = "PAN_S3_SUPER_SECRET_KEY_VALUE";
    const { client, calls } = mockClient((c) => {
      if (c.url.pathname.endsWith("/object-storage")) {
        return json(200, { enabled: true, endpoint: "https://s3.af-abj.pantechdynamics.com", beta: false });
      }
      if (c.url.pathname.endsWith("/object-storage/usage")) {
        return json(200, {
          range: "24h",
          total_bytes_sent: 1024,
          total_bytes_received: 2048,
          total_read_ops: 5,
          total_write_ops: 2,
          hours: [],
        });
      }
      if (c.method === "GET") return json(200, { data: [], next_cursor: null });
      if (c.method === "POST") {
        return json(201, {
          id: "osk_1",
          name: "ci",
          region: "af-abj",
          access_key_id: "AKIA_TEST",
          secret_access_key: secret,
          endpoint: "https://s3.af-abj.pantechdynamics.com",
        });
      }
      return new Response(null, { status: 204 });
    });

    const status = await client.objectStorage.getStatus();
    expect(status.enabled).toBe(true);

    const usage = await client.objectStorage.getUsage({ range: "24h" });
    expect(usage.total_bytes_sent).toBe(1024);

    await client.objectStorage.keys.list({ region: "af-abj" });
    const created = await client.objectStorage.keys.create({ name: "ci", region: "af-abj" });
    expect(created.secret_access_key).toBe(secret);
    expect(inspect(created)).not.toContain(secret);
    expect(JSON.stringify(created)).not.toContain(secret);

    await client.objectStorage.keys.revoke("osk_1");

    expect(calls.map((c) => `${c.method} ${c.url.pathname}${c.url.search}`)).toEqual([
      "GET /public/v1/object-storage",
      "GET /public/v1/object-storage/usage?range=24h",
      "GET /public/v1/object-storage/keys?region=af-abj",
      "POST /public/v1/object-storage/keys",
      "DELETE /public/v1/object-storage/keys/osk_1",
    ]);
    expect(calls[3]?.headers.get("idempotency-key")).toBeTruthy();
    expect(calls[4]?.headers.get("idempotency-key")).toBeTruthy();
  });

  it("manages buckets and bucket rules (CORS, lifecycle, tags, object lock, stats, empty, force delete)", async () => {
    const { client, calls } = mockClient((c) => {
      if (c.method === "DELETE") return json(202, { operation_id: "op_1", resource_id: "bkt_1", status: "submitting" });
      if (c.url.pathname.endsWith("/stats")) return json(200, { size_bytes: 4096, object_count: 3 });
      if (c.url.pathname.endsWith("/empty")) {
        return json(200, { deleted_count: 3, aborted_uploads: 1, locked_count: 0, sample_locked_keys: [] });
      }
      if (c.url.pathname.endsWith("/cors")) return json(200, { rules: [] });
      if (c.url.pathname.endsWith("/lifecycle")) return json(200, { rules: [] });
      if (c.url.pathname.endsWith("/tags")) return json(200, { tags: [{ key: "env", value: "prod" }] });
      if (c.url.pathname.endsWith("/object-lock")) return json(200, { enabled: true, mode: "GOVERNANCE", days: 30 });
      if (c.method === "POST") return json(201, { id: "bkt_1", name: "assets" });
      return json(200, { data: [], next_cursor: null });
    });

    await client.buckets.list();
    await client.buckets.create({ name: "assets", region: "af-abj" });
    await client.buckets.get("bkt_1");
    await client.buckets.update("bkt_1", { versioning: true, public_prefixes: ["public/"] });
    const stats = await client.buckets.stats("bkt_1");
    expect(stats).toEqual({ size_bytes: 4096, object_count: 3 });

    await client.buckets.getCors("bkt_1");
    await client.buckets.setCors("bkt_1", {
      rules: [
        {
          id: "allow-web",
          allowed_origins: ["https://example.com"],
          allowed_methods: ["GET"],
          allowed_headers: ["*"],
          expose_headers: ["ETag"],
          max_age_seconds: 3600,
        },
      ],
    });
    await client.buckets.getLifecycle("bkt_1");
    await client.buckets.setLifecycle("bkt_1", {
      rules: [
        {
          id: "expire-tmp",
          prefix: "tmp/",
          enabled: true,
          expiration_days: 7,
          noncurrent_expiration_days: 0,
          abort_incomplete_multipart_days: 1,
          expired_object_delete_marker: false,
        },
      ],
    });
    await client.buckets.getTags("bkt_1");
    await client.buckets.setTags("bkt_1", { tags: [{ key: "env", value: "prod" }] });
    await client.buckets.getObjectLock("bkt_1");
    await client.buckets.setObjectLock("bkt_1", { enabled: true, mode: "GOVERNANCE", days: 30, years: 0 });

    const emptied = await client.buckets.empty("bkt_1");
    expect(emptied.deleted_count).toBe(3);

    await client.buckets.delete("bkt_1", { force: true });

    expect(calls.map((c) => `${c.method} ${c.url.pathname}${c.url.search}`)).toEqual([
      "GET /public/v1/buckets",
      "POST /public/v1/buckets",
      "GET /public/v1/buckets/bkt_1",
      "PATCH /public/v1/buckets/bkt_1",
      "GET /public/v1/buckets/bkt_1/stats",
      "GET /public/v1/buckets/bkt_1/cors",
      "PUT /public/v1/buckets/bkt_1/cors",
      "GET /public/v1/buckets/bkt_1/lifecycle",
      "PUT /public/v1/buckets/bkt_1/lifecycle",
      "GET /public/v1/buckets/bkt_1/tags",
      "PUT /public/v1/buckets/bkt_1/tags",
      "GET /public/v1/buckets/bkt_1/object-lock",
      "PUT /public/v1/buckets/bkt_1/object-lock",
      "POST /public/v1/buckets/bkt_1/empty",
      "DELETE /public/v1/buckets/bkt_1?force=true",
    ]);
  });

  it("uploads and downloads binary objects with default and custom Content-Type and Accept headers", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const { client, calls } = mockClient((c) => {
      if (c.url.pathname.endsWith("/objects/download")) {
        return new Response(bytes, { status: 200, headers: { "content-type": "application/octet-stream" } });
      }
      return json(200, {
        key: c.url.searchParams.get("key") ?? "",
        size_bytes: bytes.byteLength,
        etag: '"abc123"',
        content_type: c.headers.get("content-type") ?? "application/octet-stream",
        last_modified: "2026-11-24T12:00:00Z",
        version_id: "",
        public: false,
        object_public: false,
        public_source: "private",
        public_url: "",
      });
    });

    // Default Content-Type: application/octet-stream with Uint8Array
    await client.buckets.objects.upload("bkt_1", { key: "raw.bin" }, bytes);
    expect(calls[0]?.method).toBe("PUT");
    expect(`${calls[0]?.url.pathname}${calls[0]?.url.search}`).toBe(
      "/public/v1/buckets/bkt_1/objects/upload?key=raw.bin",
    );
    expect(calls[0]?.headers.get("content-type")).toBe("application/octet-stream");
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
    expect(calls[0]?.body).toEqual(bytes);

    // Custom Content-Type with ArrayBuffer, Blob, and string
    await client.buckets.objects.upload("bkt_1", { key: "logo.png" }, bytes.buffer, {
      headers: { "Content-Type": "image/png" },
    });
    expect(calls[1]?.headers.get("content-type")).toBe("image/png");
    expect(calls[1]?.body).toBe(bytes.buffer);

    const blob = new Blob(["hello"], { type: "text/plain" });
    await client.buckets.objects.upload("bkt_1", { key: "blob.txt" }, blob);
    expect(calls[2]?.headers.get("content-type")).toBe("application/octet-stream");
    expect(calls[2]?.body).toBe(blob);

    await client.buckets.objects.upload("bkt_1", { key: "note.txt" }, "hello world", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
    expect(calls[3]?.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(calls[3]?.body).toBe("hello world");

    // Binary download with Accept: application/octet-stream
    const downloaded = await client.buckets.objects.download("bkt_1", { key: "raw.bin", inline: true });
    expect(new Uint8Array(downloaded)).toEqual(bytes);
    expect(`${calls[4]?.method} ${calls[4]?.url.pathname}${calls[4]?.url.search}`).toBe(
      "GET /public/v1/buckets/bkt_1/objects/download?key=raw.bin&inline=true",
    );
    expect(calls[4]?.headers.get("accept")).toBe("application/octet-stream");
    expect(calls[4]?.headers.has("idempotency-key")).toBe(false);
  });

  it("handles object operations and visibility public URL", async () => {
    const { client, calls } = mockClient((c) => {
      if (c.url.pathname.endsWith("/visibility")) {
        return json(200, {
          key: "images/hero.png",
          public: true,
          object_public: true,
          public_source: "object",
          public_url: "https://assets.s3.af-abj.pantechdynamics.com/images/hero.png",
        });
      }
      if (c.url.pathname.endsWith("/lock")) return json(200, { ok: true });
      if (c.url.pathname.endsWith("/tags")) return json(200, { tags: [{ key: "tier", value: "hot" }] });
      if (c.url.pathname.endsWith("/delete")) return json(200, { deleted: [{ key: "old.txt" }], failed: [] });
      if (c.url.pathname.endsWith("/folder")) return json(200, { prefix: "images/" });
      if (c.url.pathname.endsWith("/download-url") || c.url.pathname.endsWith("/upload-url")) {
        return json(200, { direct: true, url: "https://signed.example/obj", expires_in_seconds: 900 });
      }
      return json(200, { key: "images/hero.png" });
    });

    await client.buckets.objects.list("bkt_1", { prefix: "images/", limit: 50 });
    await client.buckets.objects.getMeta("bkt_1", { key: "images/hero.png" });
    await client.buckets.objects.presignDownload("bkt_1", { key: "images/hero.png", expires_in_seconds: 900 });
    await client.buckets.objects.presignUpload("bkt_1", { key: "images/hero.png", content_type: "image/png" });
    await client.buckets.objects.createFolder("bkt_1", { prefix: "images/" });
    await client.buckets.objects.copy("bkt_1", { source_key: "a.png", destination_key: "images/hero.png" });
    await client.buckets.objects.setTags("bkt_1", { key: "images/hero.png", tags: [{ key: "tier", value: "hot" }] });
    await client.buckets.objects.setLock("bkt_1", { key: "images/hero.png", legal_hold: true });
    const vis = await client.buckets.objects.setVisibility("bkt_1", { key: "images/hero.png", public: true });
    expect(vis.public).toBe(true);
    expect(vis.public_source).toBe("object");
    expect(vis.public_url).toBe("https://assets.s3.af-abj.pantechdynamics.com/images/hero.png");
    await client.buckets.objects.delete("bkt_1", { items: [{ key: "old.txt" }] });

    expect(calls.map((c) => `${c.method} ${c.url.pathname}${c.url.search}`)).toEqual([
      "GET /public/v1/buckets/bkt_1/objects?prefix=images%2F&limit=50",
      "GET /public/v1/buckets/bkt_1/objects/meta?key=images%2Fhero.png",
      "POST /public/v1/buckets/bkt_1/objects/download-url",
      "POST /public/v1/buckets/bkt_1/objects/upload-url",
      "POST /public/v1/buckets/bkt_1/objects/folder",
      "POST /public/v1/buckets/bkt_1/objects/copy",
      "PUT /public/v1/buckets/bkt_1/objects/tags",
      "PUT /public/v1/buckets/bkt_1/objects/lock",
      "PUT /public/v1/buckets/bkt_1/objects/visibility",
      "POST /public/v1/buckets/bkt_1/objects/delete",
    ]);
  });

  it("runs a full multipart upload flow and abort", async () => {
    const partBytes = new Uint8Array([1, 2, 3, 4]);
    const { client, calls } = mockClient((c) => {
      if (c.url.pathname.endsWith("/multipart/start")) {
        return json(200, { upload_id: "mpu_1", mode: "proxy", part_size_bytes: 5 * 1024 * 1024 });
      }
      if (c.url.pathname.endsWith("/multipart/sign-part")) {
        return json(200, { direct: true, url: "https://signed.example/part1", expires_in_seconds: 900 });
      }
      if (c.url.pathname.endsWith("/multipart/part")) {
        return json(200, { part_number: 1, etag: '"etag-1"' });
      }
      if (c.url.pathname.endsWith("/multipart/complete")) {
        return json(200, {
          key: "archive.tar.gz",
          etag: '"etag-final"',
          version_id: "",
          last_modified: "2026-11-24T12:00:00Z",
          public: false,
          object_public: false,
          public_source: "private",
          public_url: "",
        });
      }
      return new Response(null, { status: 204 });
    });

    const started = await client.buckets.multipart.start("bkt_1", {
      key: "archive.tar.gz",
      content_type: "application/gzip",
    });
    expect(started.upload_id).toBe("mpu_1");

    const signed = await client.buckets.multipart.signPart("bkt_1", {
      key: "archive.tar.gz",
      upload_id: started.upload_id,
      part_number: 1,
    });
    expect(signed.direct).toBe(true);

    const part = await client.buckets.multipart.uploadPart(
      "bkt_1",
      { key: "archive.tar.gz", upload_id: started.upload_id, part_number: 1 },
      partBytes,
    );
    expect(part).toEqual({ part_number: 1, etag: '"etag-1"' });
    expect(calls[2]?.headers.get("content-type")).toBe("application/octet-stream");
    expect(calls[2]?.body).toEqual(partBytes);

    const done = await client.buckets.multipart.complete("bkt_1", {
      key: "archive.tar.gz",
      upload_id: started.upload_id,
      parts: [{ part_number: 1, etag: part.etag }],
    });
    expect(done.etag).toBe('"etag-final"');

    await client.buckets.multipart.abort("bkt_1", { key: "archive.tar.gz", upload_id: "mpu_2" });

    expect(calls.map((c) => `${c.method} ${c.url.pathname}${c.url.search}`)).toEqual([
      "POST /public/v1/buckets/bkt_1/objects/multipart/start",
      "POST /public/v1/buckets/bkt_1/objects/multipart/sign-part",
      "PUT /public/v1/buckets/bkt_1/objects/multipart/part?key=archive.tar.gz&upload_id=mpu_1&part_number=1",
      "POST /public/v1/buckets/bkt_1/objects/multipart/complete",
      "POST /public/v1/buckets/bkt_1/objects/multipart/abort",
    ]);
  });

  it("does not retry non-replaying writes on 5xx or network errors, but still retries 429", async () => {
    for (const call of [
      (c: ReturnType<typeof mockClient>["client"]) => c.objectStorage.keys.create({ name: "ci", region: "af-abj" }),
      (c: ReturnType<typeof mockClient>["client"]) => c.buckets.empty("bkt_1"),
      (c: ReturnType<typeof mockClient>["client"]) => c.buckets.multipart.start("bkt_1", { key: "a.bin" }),
      (c: ReturnType<typeof mockClient>["client"]) =>
        c.buckets.multipart.complete("bkt_1", { key: "a.bin", upload_id: "u_1", parts: [] }),
    ]) {
      const serverErr = mockClient(() => json(503, {}, retryNow));
      await expect(call(serverErr.client)).rejects.toBeInstanceOf(InternalServerError);
      expect(serverErr.calls).toHaveLength(1);

      const netErr = mockClient(() => {
        throw new TypeError("fetch failed");
      });
      await expect(call(netErr.client)).rejects.toBeInstanceOf(APIConnectionError);
      expect(netErr.calls).toHaveLength(1);
    }

    const rateLimited = mockClient((_, i) =>
      i === 0
        ? json(429, { code: "RATE_LIMITED" }, retryNow)
        : json(200, { deleted_count: 0, aborted_uploads: 0, locked_count: 0, sample_locked_keys: [] }),
    );
    await expect(rateLimited.client.buckets.empty("bkt_1")).resolves.toMatchObject({ deleted_count: 0 });
    expect(rateLimited.calls).toHaveLength(2);
  });

  it("updates org-wide object storage settings and supports scoped keys and bucket encryption", async () => {
    const { client, calls } = mockClient((c) => {
      if (c.url.pathname.endsWith("/object-storage/settings")) {
        return json(200, { block_public_access: true });
      }
      if (c.url.pathname.endsWith("/object-storage/keys")) {
        return json(201, {
          id: "osk_2",
          name: "device-upload",
          region: "af-abj",
          access_key_id: "AKIA_WRITE_ONLY",
          secret_access_key: "SECRET_WO",
          read_only: false,
          permissions: "write_only",
          buckets: ["uploads"],
          prefixes: ["incoming/"],
          created_at: "2026-11-28T10:00:00Z",
          expires_at: "2027-01-01T00:00:00Z",
          endpoint: "https://s3.af-abj.pantechdynamics.com",
        });
      }
      return json(201, { id: "bkt_enc", name: "encrypted", encryption: "sse_s3" });
    });

    const settings = await client.objectStorage.updateSettings({ block_public_access: true });
    expect(settings).toEqual({ block_public_access: true });

    const key = await client.objectStorage.keys.create({
      name: "device-upload",
      region: "af-abj",
      permissions: "write_only",
      buckets: ["uploads"],
      prefixes: ["incoming/"],
      expires_at: "2027-01-01T00:00:00Z",
    });
    expect(key.permissions).toBe("write_only");
    expect(key.prefixes).toEqual(["incoming/"]);
    expect(key.secret_access_key).toBe("SECRET_WO");
    expect(JSON.stringify(key)).not.toContain("SECRET_WO");

    await client.buckets.create({ name: "encrypted", region: "af-abj", encryption: "sse_s3" });
    await client.buckets.update("bkt_enc", { encryption: "none" });

    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "PATCH /public/v1/object-storage/settings",
      "POST /public/v1/object-storage/keys",
      "POST /public/v1/buckets",
      "PATCH /public/v1/buckets/bkt_enc",
    ]);
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
    expect(calls[0]?.body).toEqual({ block_public_access: true });
  });

  it("creates browser upload forms, restores object versions, lists multipart uploads, and batch-signs parts", async () => {
    const keyTemplate = `uploads/\${filename}`;
    const { client, calls } = mockClient((c) => {
      if (c.url.pathname.endsWith("/objects/upload-form")) {
        return json(200, {
          url: "https://assets.s3.af-abj.pantechdynamics.com",
          fields: {
            key: keyTemplate,
            policy: "base64-policy",
            "x-amz-signature": "sig123",
          },
          expires_at: "2026-11-28T13:00:00Z",
          bucket_name: "assets",
        });
      }
      if (c.url.pathname.endsWith("/objects/restore-version")) {
        return json(200, {
          key: "docs/spec.pdf",
          action: "copied_version",
          restored_version_id: "ver_1",
          version_id: "ver_3",
          etag: '"etag-restored"',
          last_modified: "2026-11-28T12:00:00Z",
        });
      }
      if (c.url.pathname.endsWith("/objects/multipart")) {
        return json(200, {
          uploads: [{ key: "video.mp4", upload_id: "mpu_9", initiated: "2026-11-28T11:00:00Z" }],
        });
      }
      if (c.url.pathname.endsWith("/objects/multipart/sign-parts")) {
        return json(200, {
          parts: [
            { part_number: 1, url: "https://signed.example/p1" },
            { part_number: 2, url: "https://signed.example/p2" },
          ],
          expires_in_seconds: 900,
        });
      }
      return json(200, {});
    });

    const form = await client.buckets.objects.createUploadForm("bkt_1", {
      key_prefix: "uploads/",
      min_bytes: 1,
      max_bytes: 10 * 1024 * 1024,
      content_type: "image/png",
      expires_in_seconds: 600,
    });
    expect(form.bucket_name).toBe("assets");
    expect(form.fields.key).toBe(keyTemplate);

    const restored = await client.buckets.objects.restoreVersion("bkt_1", {
      key: "docs/spec.pdf",
      version_id: "ver_1",
    });
    expect(restored.action).toBe("copied_version");
    expect(restored.version_id).toBe("ver_3");

    const uploads = await client.buckets.multipart.list("bkt_1");
    expect(uploads.uploads).toHaveLength(1);
    expect(uploads.uploads[0]?.upload_id).toBe("mpu_9");

    const signed = await client.buckets.multipart.signParts("bkt_1", {
      key: "video.mp4",
      upload_id: "mpu_9",
      part_numbers: [1, 2],
    });
    expect(signed.parts).toHaveLength(2);
    expect(signed.expires_in_seconds).toBe(900);

    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "POST /public/v1/buckets/bkt_1/objects/upload-form",
      "POST /public/v1/buckets/bkt_1/objects/restore-version",
      "GET /public/v1/buckets/bkt_1/objects/multipart",
      "POST /public/v1/buckets/bkt_1/objects/multipart/sign-parts",
    ]);
    expect(calls[0]?.headers.get("idempotency-key")).toBeTruthy();
    expect(calls[1]?.headers.get("idempotency-key")).toBeTruthy();
    expect(calls[2]?.headers.has("idempotency-key")).toBe(false);
    expect(calls[3]?.headers.get("idempotency-key")).toBeTruthy();
  });

  it("manages shared buckets, bucket shares, notifications, and custom domains", async () => {
    const { client, calls } = mockClient((c) => {
      if (c.method === "DELETE") return new Response(null, { status: 204 });
      if (c.method === "POST") return json(201, { id: "res_1" });
      if (c.method === "PATCH") return json(200, { id: "res_1", updated: true });
      return json(200, { data: [], next_cursor: null });
    });

    await client.buckets.listShared();
    await client.buckets.shares.list("bkt_1");
    await client.buckets.shares.create("bkt_1", {
      grantee_organization_id: "org_partner",
      permissions: "read_only",
      prefixes: ["reports/"],
      expires_at: "2027-06-01T00:00:00Z",
    });
    await client.buckets.shares.revoke("bkt_1", "shr_1");

    await client.buckets.notifications.list("bkt_1");
    await client.buckets.notifications.create("bkt_1", {
      name: "on-upload",
      events: ["object.created"],
      prefix: "uploads/",
      suffix: ".png",
      target_type: "webhook",
      target_id: "wh_1",
      enabled: true,
    });
    await client.buckets.notifications.update("bkt_1", "ntf_1", {
      events: ["object.created", "object.removed"],
      enabled: false,
    });
    await client.buckets.notifications.delete("bkt_1", "ntf_1");

    await client.buckets.domains.list("bkt_1");
    await client.buckets.domains.create("bkt_1", {
      hostname: "cdn.example.com",
      certificate_id: "cert_1",
      index_document: "index.html",
      error_document: "404.html",
      spa_mode: true,
      cache_ttl_seconds: 300,
    });
    await client.buckets.domains.update("bkt_1", "bdom_1", {
      certificate_id: "cert_2",
      cache_ttl_seconds: 3600,
    });
    await client.buckets.domains.delete("bkt_1", "bdom_1");

    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "GET /public/v1/buckets/shared",
      "GET /public/v1/buckets/bkt_1/shares",
      "POST /public/v1/buckets/bkt_1/shares",
      "DELETE /public/v1/buckets/bkt_1/shares/shr_1",
      "GET /public/v1/buckets/bkt_1/notifications",
      "POST /public/v1/buckets/bkt_1/notifications",
      "PATCH /public/v1/buckets/bkt_1/notifications/ntf_1",
      "DELETE /public/v1/buckets/bkt_1/notifications/ntf_1",
      "GET /public/v1/buckets/bkt_1/domains",
      "POST /public/v1/buckets/bkt_1/domains",
      "PATCH /public/v1/buckets/bkt_1/domains/bdom_1",
      "DELETE /public/v1/buckets/bkt_1/domains/bdom_1",
    ]);
    for (const c of calls) {
      expect(c.headers.has("idempotency-key")).toBe(c.method !== "GET");
    }
  });
});
