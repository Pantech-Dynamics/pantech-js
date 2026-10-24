import { describe, expect, it } from "vitest";
import { signWebhook, verifyWebhook, WebhookVerificationError } from "../src/index.ts";

const secret = "whsec_test";
const body = '{"id":"evt_1","type":"instance.created"}';
const now = 1_760_000_000;

describe("verifyWebhook", () => {
  it("accepts a valid signature", async () => {
    const header = await signWebhook({ secret, body, timestamp: now });
    await expect(verifyWebhook({ secret, header, body, now })).resolves.toBeUndefined();
  });

  it("matches a known HMAC-SHA256 of t.body", async () => {
    // HMAC-SHA256("whsec_test", "1760000000.{...}"), computed independently.
    const { createHmac } = await import("node:crypto");
    const hex = createHmac("sha256", secret).update(`${now}.${body}`).digest("hex");
    await expect(verifyWebhook({ secret, header: `t=${now},v1=${hex}`, body, now })).resolves.toBeUndefined();
  });

  it("accepts bytes", async () => {
    const bytes = new TextEncoder().encode(body);
    const header = await signWebhook({ secret, body: bytes, timestamp: now });
    await expect(verifyWebhook({ secret, header, body: bytes.buffer, now })).resolves.toBeUndefined();
  });

  it("accepts any of several v1 values, as during a secret rotation", async () => {
    const good = (await signWebhook({ secret, body, timestamp: now })).split("v1=")[1];
    const header = `t=${now}, v1=${"0".repeat(64)}, v1=${good}`;
    await expect(verifyWebhook({ secret, header, body, now })).resolves.toBeUndefined();
  });

  it("rejects a wrong secret", async () => {
    const header = await signWebhook({ secret: "whsec_other", body, timestamp: now });
    await expect(verifyWebhook({ secret, header, body, now })).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it("rejects a changed body", async () => {
    const header = await signWebhook({ secret, body, timestamp: now });
    await expect(verifyWebhook({ secret, header, body: `${body} `, now })).rejects.toThrow(/does not match/);
  });

  it("rejects an old timestamp, and allows turning the check off", async () => {
    const header = await signWebhook({ secret, body, timestamp: now - 301 });
    await expect(verifyWebhook({ secret, header, body, now })).rejects.toThrow(/300 seconds/);
    await expect(verifyWebhook({ secret, header, body, now, toleranceSeconds: 600 })).resolves.toBeUndefined();
    await expect(verifyWebhook({ secret, header, body, now, toleranceSeconds: 0 })).resolves.toBeUndefined();
  });

  it("rejects a missing or malformed header", async () => {
    await expect(verifyWebhook({ secret, header: undefined, body, now })).rejects.toThrow(/missing/);
    await expect(verifyWebhook({ secret, header: "v1=abc", body, now })).rejects.toThrow(/malformed/);
    await expect(verifyWebhook({ secret, header: `t=${now}`, body, now })).rejects.toThrow(/malformed/);
    await expect(verifyWebhook({ secret, header: "t=abc,v1=00", body, now })).rejects.toThrow(/malformed/);
  });

  it("rejects an empty secret", async () => {
    await expect(verifyWebhook({ secret: "", header: `t=${now},v1=00`, body, now })).rejects.toThrow(/secret/);
  });
});
