# Pantech Dynamics SDK for TypeScript and JavaScript

[![CI](https://github.com/Pantech-Dynamics/pantech-js/actions/workflows/ci.yml/badge.svg)](https://github.com/Pantech-Dynamics/pantech-js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@pantechdynamic/sdk.svg)](https://www.npmjs.com/package/@pantechdynamic/sdk)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The official client for the [Pantech Dynamics public API](https://docs.pantechdynamics.com/api):
instances, VPC networks, firewalls, public IPs, load balancers, volumes, snapshots, managed
databases, managed Kubernetes, SSH keys, webhooks, billing and usage.

- Zero runtime dependencies. Uses the global `fetch` and Web Crypto, so it runs on Node.js 18+,
  Bun, Deno and edge runtimes.
- ESM and CommonJS, with types generated from the API's OpenAPI spec.
- Retries, idempotency keys, typed errors, pagination, operation waiting and webhook
  verification built in.

```sh
npm install @pantechdynamic/sdk
```

## Quickstart

Create an API key in the console under **Organization › API keys**, then:

```ts
import { Pantech } from "@pantechdynamic/sdk";

const client = new Pantech({ apiKey: process.env.PANTECH_API_KEY });

// Order an instance and wait until it is running.
const order = await client.instances.create({
  name: "web-1",
  plan_slug: "starter",
  image_slug: "ubuntu-24-04",
  ssh_key_id: "sshk_…",
});
await client.instanceOrders.wait(order);

const vm = await client.instances.get(order.instance_id);
console.log(vm.public_ipv4);

// Every write returns an operation; wait for it.
await client.operations.wait(await client.instances.stop(vm.id));
```

`apiKey` defaults to `PANTECH_API_KEY`, and `baseURL` to `PANTECH_API_URL`, else
`https://api.pantechdynamics.com/public/v1`. Request and response fields are exactly as the API
sends them (`plan_slug`, `next_cursor`); methods are camelCase.

```ts
new Pantech({
  apiKey: "PAN_…",
  baseURL: "https://api.example.com/public/v1",
  maxRetries: 3, // default
  timeout: 60_000, // per attempt, in ms (default)
  fetch: customFetch, // default: globalThis.fetch
});
```

Every method takes per-call options last: `{ signal, timeout, maxRetries, idempotencyKey, headers }`.

## Resources

| Family | Examples |
|---|---|
| Account | `me.get()`, `me.revoke()` |
| Catalogue | `regions.list()`, `plans.list({ placement })`, `images.list()`, `diskOfferings.quote(slug, { size_gb })`, `databaseEngines.list()`, `kubernetesVersions.list()`, `pricing.estimate({...})` |
| Instances | `instances.list/listAll/create/get/delete/start/stop/reboot/rebuild/rename/resize/restore/…`, `instances.snapshots.*`, `instances.sshAccess.*`, `instanceOrders.wait(order)` |
| Networks | `networks.*`, `networks.subnets.list(networkId)`, `networks.firewallRules.create(subnetId, {...})` |
| Public IPs | `publicIps.*`, `publicIps.portForwardingRules.*` |
| Load balancers | `loadBalancers.*` |
| Kubernetes | `kubernetes.*`, `kubernetes.nodePools.*`, `kubernetes.addons.toggle(...)` |
| Security groups | `securityGroups.*`, `securityGroups.replaceRules(id, {...})` |
| Volumes and snapshots | `volumes.*`, `volumes.snapshots.*`, `snapshots.*` |
| Databases | `databases.*`, `databases.snapshots.*`, `databaseOrders.wait(order)` |
| SSH keys, webhooks | `sshKeys.*`, `webhooks.*`, `webhooks.deliveries.*` |
| Billing and usage | `billing.credit.get()`, `billing.credit.purchases.create(...)`, `billing.receipts.getPdf(id)`, `usage.get()` |
| Operations | `operations.get(id)`, `operations.wait(id)`, `operations.stream(id)` |

Every operation in the public spec has a method; `test/coverage.test.ts` fails if one is missing.
For anything else, `client.request({ method, path, query, body })` sends a raw request with the
same auth, retries and errors.

## Pagination

`list()` returns one page (`{ data, next_cursor }`). `listAll()` follows the cursor for you:

```ts
for await (const vm of client.instances.listAll({ observed_state: "running" })) {
  console.log(vm.id, vm.name);
}
for await (const subnet of client.networks.subnets.listAll("net_…")) console.log(subnet.cidr);
```

## Waiting

```ts
const op = await client.operations.wait(accepted, { timeoutMs: 10 * 60_000, onUpdate: (o) => console.log(o.status) });
await client.databaseOrders.wait(order); // paid, provisioned, and its create operation done
for await (const o of client.operations.stream("op_…")) console.log(o.status); // Server-Sent Events
```

A failed operation rejects with `OperationFailedError` (`code`, `detail` from its `failure`), a
failed or unpaid order with `OrderFailedError`, and a wait that runs out with `WaitTimeoutError`.

## Errors

Every error is a `PantechError` carrying `status`, `code`, `title`, `detail`, `requestId` and
`errors` (the field errors of a `422`). Branch on `code`, never on the message:

```ts
import { isPantechError, NotFoundError } from "@pantechdynamic/sdk";

try {
  await client.instances.get("vm_…");
} catch (err) {
  if (err instanceof NotFoundError) { /* gone */ }
  else if (isPantechError(err, "INSUFFICIENT_SCOPE")) { /* key lacks a scope */ }
  else throw err;
}
```

Subclasses: `BadRequestError` (400), `AuthenticationError` (401), `PaymentRequiredError` (402),
`PermissionDeniedError` (403), `NotFoundError` (404), `ConflictError` (409), `ValidationError`
(422), `RateLimitError` (429), `InternalServerError` (5xx), `APIConnectionError` and
`APITimeoutError` (no answer).

## Retries and idempotency

Every POST, PUT, PATCH and DELETE carries an `Idempotency-Key` (a random UUID, or yours via
`idempotencyKey`), and every retry of that call reuses it, so a change cannot happen twice.
Network errors, timeouts, `429` (after `Retry-After`), `500`, `502`, `503` and `504` are retried up
to `maxRetries` times with jittered backoff.

The API does not replay some writes by key, so the SDK sends them once (except after a `429`,
which is refused before anything runs): creating and deleting SSH keys, opening an instance
console, issuing a volume key credential, testing, deleting, rotating the secret of and
redelivering webhooks, and `DELETE /me`.

## Webhooks

```ts
import { verifyWebhook } from "@pantechdynamic/sdk";

await verifyWebhook({
  secret: process.env.PANTECH_WEBHOOK_SECRET!,
  header: request.headers.get("Pantech-Signature"),
  body: await request.text(), // the raw body, not re-serialised JSON
  toleranceSeconds: 300, // default
});
```

It rejects with `WebhookVerificationError` when the signature does not match any `v1` value or
the timestamp is too old. On Node.js 18, start node with `--experimental-global-webcrypto`
(Node.js 20+ needs nothing). See `examples/webhook-receiver.ts`.

## Examples

`examples/` has `create-instance.ts`, `list.ts` and `webhook-receiver.ts`. With Node.js 23.6+:
`npm run build && PANTECH_API_KEY=PAN_… node examples/list.ts`.

## Development

```sh
npm ci
npm run spec:sync   # download the published spec into spec/public-api.yaml (or pass a path/URL)
npm run generate    # regenerate src/types.gen.ts and src/models.gen.ts from it
npm run typecheck && npm run lint && npm test && npm run build
```

The SDK is generated from the published [OpenAPI spec](https://docs.pantechdynamics.com/openapi/public-api.yaml).
See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and how releases are made. Report security
issues as described in [SECURITY.md](SECURITY.md).

## License

MIT, see [LICENSE](LICENSE).
