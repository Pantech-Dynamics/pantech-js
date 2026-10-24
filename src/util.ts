// Small runtime helpers with no dependencies, safe on every runtime.

import { PantechError } from "./errors.js";

/** A random UUIDv4, from Web Crypto where the runtime has it. */
export function uuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") {
    c.getRandomValues(b);
  } else {
    // Node.js 18 has no global Web Crypto. An Idempotency-Key only needs to
    // be unique per change, not secret.
    for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  }
  b[6] = ((b[6] as number) & 0x0f) | 0x40;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Reads an environment variable where the runtime has `process.env`; undefined elsewhere. */
export function readEnv(name: string): string | undefined {
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    const value = proc?.env?.[name]?.trim();
    return value ? value : undefined;
  } catch {
    // Deno without --allow-env throws on access.
    return undefined;
  }
}

/** Resolves after `ms`, or rejects with the signal's reason when it aborts first. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Builds a path from a template, percent-encoding each id. An empty id is
 * refused, so `delete("")` can never reach a different endpoint.
 */
export function path(strings: TemplateStringsArray, ...ids: string[]): string {
  let out = strings[0] ?? "";
  ids.forEach((id, i) => {
    if (typeof id !== "string" || id === "") {
      throw new PantechError("A resource id is required, and it must be a non-empty string.");
    }
    out += encodeURIComponent(id) + (strings[i + 1] ?? "");
  });
  return out;
}
