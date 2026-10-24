// Loads the built package (ESM and CJS) and runs a request and a webhook
// check with no network. Run after `npm run build`, on any runtime:
//   node test/smoke.mjs   bun test/smoke.mjs   deno run test/smoke.mjs
import { createRequire } from "node:module";
import * as esm from "../dist/index.js";

if (!globalThis.crypto?.subtle) {
  // Node.js 18 without --experimental-global-webcrypto.
  const { webcrypto } = await import("node:crypto");
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

const cjs = createRequire(import.meta.url)("../dist/index.cjs");

function assert(ok, message) {
  if (!ok) throw new Error(`smoke: ${message}`);
}

for (const [name, sdk] of [
  ["esm", esm],
  ["cjs", cjs],
]) {
  const seen = [];
  const client = new sdk.Pantech({
    apiKey: "PAN_smoke",
    baseURL: "https://api.invalid/public/v1",
    fetch: async (url, init) => {
      seen.push([init.method, url, new Headers(init.headers).get("idempotency-key")]);
      if (url.endsWith("/instances")) return Response.json({ data: [{ id: "vm_1" }], next_cursor: null });
      return Response.json({ operation_id: "op_1", resource_id: "vm_1", status: "submitting" }, { status: 202 });
    },
  });
  const ids = [];
  for await (const vm of client.instances.listAll()) ids.push(vm.id);
  assert(ids.join() === "vm_1", `${name}: listAll`);
  const accepted = await client.instances.stop("vm_1");
  assert(accepted.operation_id === "op_1", `${name}: stop`);
  assert(seen[1][2], `${name}: Idempotency-Key`);

  const header = await sdk.signWebhook({ secret: "whsec_x", body: "{}" });
  await sdk.verifyWebhook({ secret: "whsec_x", header, body: "{}" });
  let rejected = false;
  await sdk.verifyWebhook({ secret: "whsec_y", header, body: "{}" }).catch((e) => {
    rejected = e instanceof sdk.WebhookVerificationError;
  });
  assert(rejected, `${name}: webhook rejection`);
  assert(sdk.VERSION === "0.1.0" || /^\d+\.\d+\.\d+/.test(sdk.VERSION), `${name}: VERSION`);
}

console.log(`smoke ok (${typeof Bun !== "undefined" ? "bun" : typeof Deno !== "undefined" ? "deno" : "node"})`);
