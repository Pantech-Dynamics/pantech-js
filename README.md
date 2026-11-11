# Pantech Dynamics SDK for TypeScript and JavaScript

[![CI](https://github.com/Pantech-Dynamics/pantech-js/actions/workflows/ci.yml/badge.svg)](https://github.com/Pantech-Dynamics/pantech-js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@pantechdynamic/sdk.svg)](https://www.npmjs.com/package/@pantechdynamic/sdk)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The official client for the [Pantech Dynamics public API](https://docs.pantechdynamics.com/api):
instances, VPC networks, firewalls, public IPs, load balancers, volumes, snapshots, managed
databases, managed Kubernetes, SSH keys, webhooks, billing, usage, and moving from another cloud.

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
| Move from another cloud | `migrate.connections.*`, `migrate.scans.*`, `migrate.migrations.*` |
| DNS | `dns.zones.*` (`exportZoneFile`, `importZoneFile`, `verify`, `wait`), `dns.records.*` (`batch`, `wait`) |
| Certificates | `certificates.request/import/get/list/update/verify/reimport/export/revoke/delete`, `certificates.wait(id)` |
| Teams and access policies | `iam.members.list()`, `iam.actions.list()`, `iam.settings.*`, `iam.teams.*`, `iam.teams.members.*`, `iam.policies.*`, `iam.policies.attachments.*`, `iam.effectiveAccess(userId)`, `iam.simulate({...})` |
| Container registry | `registry.namespace.get/set`, `registry.repositories.*`, `registry.tags.*`, `registry.tokens.*` |
| Domains | `domains.search({ query })`, `domains.register({...})`, `domains.transfer({...})`, `domains.renew(id)`, `domains.orders.wait(result)` |
| Operations | `operations.get(id)`, `operations.wait(id)`, `operations.stream(id)` |

Every operation in the public spec has a method, except agent sessions, which answer only AI apps
connected through Pantech's MCP server; `test/coverage.test.ts` fails if one is missing.
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
failed or unpaid order with `OrderFailedError`, a failed cloud connection or scan with
`CloudFailedError`, a failed DNS zone or record change with `DNSFailedError`, a certificate that
cannot be issued with `CertificateFailedError`, and a wait that runs out with `WaitTimeoutError`.

## Move from another cloud

`client.migrate` connects an AWS account through a read-only role that only Pantech can assume (no
access keys are shared), scans what runs there, and plans the move with a price comparison and a
Terraform export. Nothing is created on Pantech until you apply the Terraform.

```ts
let conn = await client.migrate.connections.create({ name: "Production AWS" });
console.log(conn.setup.quick_create_url); // create the stack in AWS, then send its RoleArn output
await client.migrate.connections.update(conn.id, { role_arn: "arn:aws:iam::…:role/…" });
conn = await client.migrate.connections.wait(conn.id); // CloudFailedError if the role cannot be assumed

const scan = await client.migrate.scans.wait((await client.migrate.scans.start(conn.id)).id);
const plan = await client.migrate.migrations.create({ scan_id: scan.id, name: "Move to Pantech" });
console.log(plan.estimate?.pantech_monthly_minor, plan.estimate?.source_monthly_minor);
const { files } = await client.migrate.migrations.exportTerraform(plan.id); // main.tf, variables.tf
```

`migrate.migrations.updateItem(id, { key, excluded: true })` leaves an item out, or changes its
plan, size, address range or role, before you export. See `examples/migrate-from-aws.ts`.

## Certificates

`client.certificates` issues TLS certificates through a publicly trusted CA and renews them by
itself, or holds certificates you import, for Pantech load balancers and your own servers.

```ts
let cert = await client.certificates.request({ names: ["example.com", "*.example.com"], exportable: true });
for (const v of cert.validations) {
  // Names outside your Pantech DNS zones: add this CNAME once.
  if (v.method === "cname") console.log(v.cname_name, "CNAME", v.cname_target);
}
cert = await client.certificates.wait(cert.id); // CertificateFailedError if it cannot be issued

const exported = await client.certificates.export(cert.id); // needs the delete scope; owners are emailed
await writeKeyFile(exported.private_key_pem); // non-enumerable: console.log and JSON.stringify leave it out
```

`certificates.import({ certificate_pem, private_key_pem })` imports one, `reimport` replaces it
before it expires, `verify` re-checks CNAMEs now, and `revoke` and `delete` retire it. The SDK never
logs request or response bodies, so an imported key is not logged either. See
`examples/certificates.ts`.

An appliance load balancer can end TLS with one: `client.loadBalancers.create({ …, protocol:
"https", certificate_id: cert.id, tls_policy: "modern", redirect_http: true })`; renewals reach it
by themselves. VPC native load balancers pass TLS through as `tcp`, and a certificate in use cannot
be revoked or deleted (`CERTIFICATE_IN_USE`).

## Teams and access policies

`client.iam` controls who in your organization may do what. Policies are statements that allow or
deny actions (`instances:Stop`, `dns:*`, `*:Read`) on resources (`*`, an id, or `name:staging-*`),
optionally only from some addresses or with MFA; attach them to members or teams. The `iam` helper
builds statements and checks the API's limits before the call.

```ts
import { iam } from "@pantechdynamic/sdk";

const team = await client.iam.teams.create({ name: "Platform" });
const policy = await client.iam.policies.create({
  name: "staging-operators",
  statements: [
    iam.allow(["instances:Read", "instances:Start", "instances:Stop"], ["name:staging-*"], { sourceIp: ["102.89.0.0/16"] }),
    iam.deny(["*:Delete"]),
  ],
});
await client.iam.policies.attachments.attach(policy.id, { principal_type: "team", principal_id: team.id });
await client.iam.teams.members.add(team.id, "usr_…");

const sim = await client.iam.simulate({ user_id: "usr_…", action: "instances:Delete", resource: "vm_…" });
console.log(sim.allowed, sim.decision); // false "explicit_deny"
```

`iam.policies.update(id, body, { ifMatch: policy.version })` refuses a lost update.
`iam.actions.list()` is the action catalogue, `iam.effectiveAccess(userId)` what applies to a
member, `iam.settings` the organization's `member_baseline`, and `iam.MANAGED_POLICY_IDS`
Pantech's ready-made policies. See `examples/access-policies.ts`.

## Container registry

`client.registry` manages your private registry at `registry.pantechdynamics.com`: one namespace per
organization, repositories (private by default), their tags, and registry-only tokens for CI and
clusters. Push and pull with `docker`, logged in with an API key or a registry token.

```ts
await client.registry.namespace.set({ name: "acme" }); // once; images are registry.pantechdynamics.com/acme/…
const repo = await client.registry.repositories.create({
  name: "api/server",
  immutable_tags: true,
  retention: { keep_last: 50, keep_pattern: "v*" },
});
for await (const tag of client.registry.tags.listAll(repo.id)) console.log(tag.name, tag.digest);

const token = await client.registry.tokens.create({ name: "github-actions", permission: "push", repositories: ["api/server"] });
await saveToCiSecrets(token.secret); // shown only now (null on a replayed create)
```

The token's `secret` is non-enumerable: `token.secret` reads it, but `console.log(token)` and
`JSON.stringify(token)` leave it out. `docker login registry.pantechdynamics.com -u pantech -p
<secret>` then works for that repository; `registry.tokens.delete(id)` revokes it. See
`examples/container-registry.ts`.

## DNS and domains

`client.dns` hosts zones on Pantech DNS, Pantech's own name servers; `client.domains` buys,
transfers in and renews domains, paid from your credit. Each zone gets its own two name servers to
set at your registrar. Changes go live in the background: a record set is `pending` until it
answers, usually within a minute, and records added before the zone is `active` (delegated) stay
`pending` until it is. The first 5 zones are free; `client.dns.zones.quote()` gives the price of the
rest in your currency.

```ts
let zone = await client.dns.zones.create({ name: "example.com" });
zone = await client.dns.zones.wait(zone.id); // until it has its name servers
console.log(zone.name_servers); // set these at your registrar

const rec = await client.dns.records.create(zone.id, { name: "www", type: "A", values: ["203.0.113.10"] });
await client.dns.records.wait(zone.id, rec.id); // DNSFailedError if the change fails

// Change it only if nobody else did since you read it (412 PreconditionFailedError otherwise).
await client.dns.records.update(zone.id, rec.id, { values: ["203.0.113.11"] }, { ifMatch: rec.version });

await client.dns.records.batch(zone.id, {
  changes: [
    { action: "create", record: { name: "@", type: "MX", values: ["10 mail.example.com"] } },
    { action: "delete", record_id: "dnsr_…" },
  ],
});
const zoneFile = await client.dns.zones.exportZoneFile(zone.id); // BIND zone file, as a string

const { data } = await client.domains.search({ query: "example" });
const result = await client.domains.register({ name: "example.com", contact, accept_terms: true });
try {
  await client.domains.orders.wait(result); // OrderFailedError (amount refunded) if it fails
} catch (err) {
  if (!(err instanceof PaymentRequiredError)) throw err;
  // Your credit does not cover it: the order waits for a payment until err.paymentExpiresAt.
  // In US dollars your saved card is charged the difference; in naira, add credit.
  if (err.paymentUrl) sendUserTo(err.paymentUrl); // only when the bank asks to confirm the payment
  await client.domains.orders.wait(result, { waitForPayment: true });
  // Or, after saving a new card or adding credit: await client.domains.orders.retryPayment(result.order.id);
}
```

Prices are before VAT. A TLD whose offer has `privacy_always_on: true` (the `.ng` family) has
privacy protection that cannot be turned off: asking for `privacy: false` is a `422` naming field
`privacy` with code `PRIVACY_ALWAYS_ON`. `.ng` contacts need `state` and `postal_code`, and
`name.ng` registrants must be people (`type: "person"`).

`domains` also has `listTlds`, `checkTransfer`, `update` (auto-renew, transfer lock, privacy),
`setNameServers`, `getContact`/`updateContact`, `requestAuthCode`/`getAuthCode`,
`orders.list(domainId)`, `orders.get(orderId)` and `orders.retryPayment(orderId)`. The registrant
contact is personal data: the SDK never logs requests or responses. See `examples/dns-and-domains.ts`.

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
`PermissionDeniedError` (403), `NotFoundError` (404), `ConflictError` (409),
`PreconditionFailedError` (412), `ValidationError` (422), `RateLimitError` (429),
`InternalServerError` (5xx), `APIConnectionError` and `APITimeoutError` (no answer).

DNS and domain codes are typed: `DNSErrorCode` and `DomainErrorCode` are unions of every code those
endpoints answer with (`DNS_RECORD_EXISTS`, `VERSION_CONFLICT`, `DOMAIN_NOT_AVAILABLE`…), listed at
runtime in `DNS_ERROR_CODES` and `DOMAIN_ERROR_CODES` (and `RegistryErrorCode`,
`REGISTRY_ERROR_CODES` for the container registry, `IamErrorCode`, `IAM_ERROR_CODES` for access
policies, `CertificateErrorCode`, `CERTIFICATE_ERROR_CODES` for certificates), and `isPantechError(err, code)` completes
them.

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

`examples/` has `create-instance.ts`, `list.ts`, `webhook-receiver.ts`, `migrate-from-aws.ts`,
`dns-and-domains.ts`, `container-registry.ts`, `access-policies.ts` and `certificates.ts`. With Node.js 23.6+:
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
