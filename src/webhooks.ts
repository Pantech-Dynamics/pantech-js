// Verifying webhook deliveries. Each request carries
//   Pantech-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
// with two v1 values for 24 hours after a secret rotation. Uses Web Crypto,
// so it runs on Node.js, Bun, Deno and edge runtimes alike.

import { PantechError, WebhookVerificationError } from "./errors.js";

/** The header a delivery's signature arrives in. */
export const WEBHOOK_SIGNATURE_HEADER = "Pantech-Signature";

/** Five minutes, the API's own window. */
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

export type WebhookBody = string | Uint8Array | ArrayBuffer;

export interface VerifyWebhookOptions {
  /** The webhook's signing secret (`whsec_…`). */
  secret: string;
  /** The `Pantech-Signature` header's value. */
  header: string | null | undefined;
  /** The raw request body, exactly as received: not parsed and re-serialised JSON. */
  body: WebhookBody;
  /** Reject a timestamp further than this from now. Default 300; 0 turns the check off. */
  toleranceSeconds?: number;
  /** The current time in unix seconds, for tests. */
  now?: number;
}

const encoder = new TextEncoder();

function bytes(body: WebhookBody): Uint8Array {
  if (typeof body === "string") return encoder.encode(body);
  return body instanceof Uint8Array ? body : new Uint8Array(body);
}

function subtle(): SubtleCrypto {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!s) {
    throw new PantechError(
      "Web Crypto is not available in this runtime. On Node.js 18 start node with --experimental-global-webcrypto, or use Node.js 20 or later.",
    );
  }
  return s;
}

async function hmacHex(secret: string, timestamp: string, body: Uint8Array): Promise<string> {
  const s = subtle();
  const key = await s.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prefix = encoder.encode(`${timestamp}.`);
  const message = new Uint8Array(prefix.length + body.length);
  message.set(prefix, 0);
  message.set(body, prefix.length);
  const mac = new Uint8Array(await s.sign("HMAC", key, message));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings in time that depends only on their length. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Checks a delivery's `Pantech-Signature`. Resolves when it is valid;
 * rejects with WebhookVerificationError when the header is missing or
 * malformed, the timestamp is outside the tolerance, or no `v1` matches.
 */
export async function verifyWebhook(options: VerifyWebhookOptions): Promise<void> {
  const { secret, header } = options;
  if (!secret) throw new WebhookVerificationError("No webhook secret was given to verify the signature with.");
  if (!header) throw new WebhookVerificationError(`The ${WEBHOOK_SIGNATURE_HEADER} header is missing.`);

  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1" && value) signatures.push(value.toLowerCase());
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    throw new WebhookVerificationError(`The ${WEBHOOK_SIGNATURE_HEADER} header is malformed.`);
  }

  const tolerance = options.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (tolerance > 0 && Math.abs(now - Number(timestamp)) > tolerance) {
    throw new WebhookVerificationError(
      `The webhook's timestamp is more than ${tolerance} seconds from now. Check the server's clock, or this may be a replayed delivery.`,
    );
  }

  const expected = await hmacHex(secret, timestamp, bytes(options.body));
  let matched = false;
  for (const signature of signatures) {
    if (timingSafeEqual(expected, signature)) matched = true;
  }
  if (!matched) {
    throw new WebhookVerificationError(
      "The webhook signature does not match. Check the secret, and pass the raw body.",
    );
  }
}

/**
 * Signs a body the way the API does, returning a `Pantech-Signature`
 * value. For testing your own webhook receiver.
 */
export async function signWebhook(options: { secret: string; body: WebhookBody; timestamp?: number }): Promise<string> {
  const t = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  return `t=${t},v1=${await hmacHex(options.secret, t, bytes(options.body))}`;
}
