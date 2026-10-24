// Node.js 18 has no global Web Crypto; the SDK documents the flag, and the
// tests install Node's own implementation instead.
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}
