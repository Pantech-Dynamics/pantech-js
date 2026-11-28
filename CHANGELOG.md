# Changelog

A new version heading here (`## X.Y.Z (YYYY-MM-DD)`) pushed to main is
tagged `vX.Y.Z` and published to npm. Add changes under `## Unreleased`
until then.

## Unreleased

## 0.7.1 (2026-11-28)

- `iam.MANAGED_POLICY_IDS` and `ManagedPolicyId` include Pantech's six new managed policies:
  `pol_pantech_compute_admin`, `pol_pantech_kubernetes_admin`, `pol_pantech_object_storage_admin`,
  `pol_pantech_email_manager`, `pol_pantech_certificate_manager` and `pol_pantech_migrate_manager`.

## 0.7.0 (2026-11-28)

- Object Storage parity across settings, uploads, versioning, multipart, sharing, notifications,
  and custom domains:
  - `objectStorage.updateSettings({ block_public_access })` (`PATCH /object-storage/settings`),
    with `ObjectStorageSettings` and `UpdateObjectStorageSettingsRequest` type aliases and
    `block_public_access` on `ObjectStorageStatus`.
  - Scoped S3 access keys (`permissions`: `read_only` | `read_write` | `write_only`, `prefixes`,
    and `expires_at`) and default bucket server-side encryption (`encryption`: `none` | `sse_s3`,
    `server_side_encryption` on object metadata).
  - `buckets.objects.createUploadForm(bucketId, ...)` (`POST /buckets/{bucket_id}/objects/upload-form`)
    for direct browser POST uploads and `buckets.objects.restoreVersion(bucketId, ...)`
    (`POST /buckets/{bucket_id}/objects/restore-version`) to restore historical versions or remove
    delete markers.
  - `buckets.multipart.list(bucketId)` (`GET /buckets/{bucket_id}/objects/multipart`) and
    `buckets.multipart.signParts(bucketId, ...)` (`POST /buckets/{bucket_id}/objects/multipart/sign-parts`)
    to inspect in-progress uploads and batch-sign up to 100 part URLs at once.
  - Cross-organization bucket sharing: `buckets.listShared()` (`GET /buckets/shared`) and
    `buckets.shares` (`list`, `create`, `revoke`).
  - Bucket event notifications: `buckets.notifications` (`list`, `create`, `update`, `delete`).
  - Bucket custom domains and static websites: `buckets.domains` (`list`, `create`, `update`, `delete`).
- Vendored OpenAPI spec synced to the current public API and types regenerated.

## 0.6.1 (2026-11-25)

- The vendored spec is the one now published, and the `spec/pending` files it covers are gone; the
  types are regenerated from it. `migrate.connections.enrollAgent` and `revokeAgent` work on every
  connection: AWS, Google Cloud, Azure and Huawei Cloud connections can have an agent too, for
  server copies, database imports and Kubernetes moves (Pantech still scans those clouds itself),
  and enrollment no longer answers `409 CLOUD_CONNECTION_NOT_AGENT`. The doc comments say a
  connection has one agent, and that revoking it also ends its server copy uploads in progress.
- The published spec gives two routes the id `putBucketObjectLock`; the SDK keeps its names
  (`setBucketObjectLock` for an object's lock, `putBucketObjectLock` for the bucket's default) through
  `scripts/renamed-operations.json`, so no type changes name.
- Operations in the published spec the SDK does not wrap yet (functions, email, instance password
  reset and the database CA certificate) are listed in `scripts/not-in-sdk.json`; call them with
  `client.request`.

## 0.6.0 (2026-11-25)

- Pantech Migrate reads every cloud it supports, not only AWS: `migrate.providers.list()` lists
  them and how each is read (`federated` for AWS, Google Cloud, Azure and Huawei Cloud; `agent`
  for DigitalOcean, Hetzner, Linode, Vultr, Contabo and OpenStack). `migrate.connections.create`
  takes a `provider`, `update` takes `gcp`, `azure` or `huawei` federation details, and
  connections and scans report `external_account_id`, connections their `agent` and the provider's
  `setup`, and scans their `provider` and `runner`.
- The Pantech Migrate agent: `migrate.connections.enrollAgent` (a one-time code, sent once and
  never retried, since each call issues a new one) and `migrate.connections.revokeAgent`.
- People: a scan's `users` say where each person comes from (`source`), their `access_level` and
  their `roles`, and `migrate.migrations.sendInvites` invites a plan's `user` items with their
  roles. Plan item targets carry `image_slug` (Windows Server, on request) and `invite_id`.
- Buckets: `migrate.copyAccess` (`get`, `set`) and `migrate.bucketImports` (`list`, `listAll`,
  `start`, `get`, `cancel`, `resync` with optional `mirror_deletes`).
- Servers: `migrate.serverCopies` (`start`, `getTemplate` for the AWS copy role, `list`, `listAll`,
  `get`, `sync`, `cutOver`, `cancel`).
- Databases: `migrate.databaseImports` (`start`, `list`, `listAll`, `get`, `checkReadiness`,
  `cutOver`, `cancel`, `revokeAccess`).
- Kubernetes: `migrate.kubernetesMoves` (`start`, `list`, `listAll`, `getSourceAccess`, `get`,
  `preview`, `apply`, `syncVolumes`, `cutOver`, `cancel`, and `downloadManifests`, which returns
  the YAML as a string). Scans report `kubernetes_clusters`, plans have `kubernetes_cluster` items,
  and `migrate.migrations.updateItem` takes `allow_version_downgrade`.
- Type aliases for every new schema, such as `CloudProvider`, `CloudAgentEnrollment`, `CopyAccess`,
  `BucketImport`, `ServerCopy`, `DatabaseImport`, `KubernetesMove` and `KubernetesMoveDetail`.
- `databases.getSnapshotSchedule` and `databases.setSnapshotSchedule`: automatic snapshots of a
  database's data disk, as for instances and volumes.

## 0.5.0 (2026-11-24)

- Dynamic IP for instances: `instances.dynamicIp` (`get`, `set`, `disable`, and non-retrying
  `rotate`), optional `address_rotation` on `instances.create`, and `DynamicIp`, `DynamicIpEvent`,
  and `PutDynamicIpRequest` type aliases.
- S3-compatible Object Storage: `client.objectStorage` (`getStatus`, `getUsage`, and
  `objectStorage.keys.{list, create, revoke}` with non-enumerable `secret_access_key`) and
  `client.buckets` (`list`, `create`, `get`, `update`, `delete`, `stats`, `empty`, CORS, lifecycle,
  tags, object lock, `buckets.objects.*` with binary upload/download and per-object visibility, and
  `buckets.multipart.*`).
- Raw binary request body support (`BinaryBody`: `Uint8Array | ArrayBuffer | Blob | string`,
  defaulting to `Content-Type: application/octet-stream` unless overridden) and `Accept:
  application/octet-stream` for `arrayBuffer` binary downloads across Node.js, Bun, Deno, and edge
  runtimes.

## 0.4.0 (2026-11-10)

- `client.dns`, Pantech DNS on Pantech's own name servers (two per zone): `dns.zones` (`list`, `listAll`,
  `create`, `get`, `update`, `delete`, `verify`, `exportZoneFile` returning the BIND zone file as
  a string, `importZoneFile`) and `dns.records` (`list`, `listAll`, `create`, `get`, `update` and
  `delete` with `{ ifMatch: version }`, `batch` for up to 1000 changes at once).
- `client.domains`: `listTlds`, `search`, `checkTransfer`, `list`, `listAll`, `get`, `register`,
  `transfer`, `update` (auto-renew, transfer lock, privacy), `setNameServers`, `getContact`,
  `updateContact`, `renew`, `requestAuthCode`, `getAuthCode`, and `domains.orders` (`list`, `get`).
- `dns.zones.wait()` (until the zone has its name servers) and `dns.records.wait()` (until the
  record set answers), which reject with the new `DNSFailedError`, and `domains.orders.wait()`,
  which rejects with `OrderFailedError` carrying the order's `failure_code`.
- `PreconditionFailedError` for `412` (`VERSION_CONFLICT`); `DNSErrorCode`, `DomainErrorCode`,
  `DNS_ERROR_CODES` and `DOMAIN_ERROR_CODES` for every DNS and domain problem code.
- `examples/dns-and-domains.ts`.
- `client.registry`, the private container registry: `registry.namespace` (`get`, `set`),
  `registry.repositories` (`list`, `listAll`, `create`, `get`, `update` for visibility, tag
  immutability and retention, `delete`), `registry.tags` (`list`, `listAll`, `get`, `delete`) and
  `registry.tokens` (`list`, `listAll`, `create`, `delete`). A new token's `secret` is
  non-enumerable, so `console.log` and `JSON.stringify` leave it out; read `token.secret`.
- `RegistryErrorCode` and `REGISTRY_ERROR_CODES` for every registry problem code.
- `examples/container-registry.ts`.
- `client.iam`, teams and access policies: `iam.actions.list`, `iam.settings` (`get`, `update`),
  `iam.teams` (`list`, `listAll`, `create`, `get`, `update`, `delete`) with `iam.teams.members`
  (`list`, `listAll`, `add`, `remove`), `iam.policies` (`list`, `listAll`, `create`, `get`,
  `update` with `{ ifMatch }`, `delete`) with `iam.policies.attachments` (`list`, `attach`,
  `detach`), `iam.effectiveAccess(userId)` and `iam.simulate(...)`.
- The `iam` helper: `iam.allow(...)`, `iam.deny(...)` and `iam.statement(...)` build typed policy
  statements and check the API's limits first; `iam.MANAGED_POLICY_IDS` lists Pantech's policies.
- `IamErrorCode` and `IAM_ERROR_CODES` for every access policy problem code; `IfMatchOptions` for
  any change conditional on a version (`RecordWriteOptions` is now an alias of it).
- `examples/access-policies.ts`.
- `iam.members.list` / `listAll`: the organization's members with their teams and policy counts;
  `iam.settings.update` takes `{ ifMatch }`.
- `client.certificates`, Certificate Manager: `list`, `listAll`, `request`, `import`, `get`,
  `update`, `verify`, `reimport`, `export`, `revoke`, `delete`, and `wait(id)` until it is issued,
  which rejects with the new `CertificateFailedError`. An exported `private_key_pem` is
  non-enumerable, like a new registry token's `secret`.
- `CertificateErrorCode` and `CERTIFICATE_ERROR_CODES` for every certificate problem code.
- `examples/certificates.ts`.
- `dns.zones.quote()`: the free zone allowance and the monthly price of each further zone.
- `domains.orders.wait()` rejects with `PaymentRequiredError` (code `AWAITING_PAYMENT`, with
  `paymentUrl`, `paymentExpiresAt` and `order`) when an order is `awaiting_payment` because your
  credit does not cover it, instead of waiting silently; `{ waitForPayment: true }` keeps waiting
  while the user pays. Domain orders carry `payment_url` and `payment_expires_at`; TLD offers and
  search results carry `privacy_always_on`.
- `domains.orders.retryPayment(orderId)` (`POST /domain-orders/{order_id}/retry-payment`): an
  order waiting in `awaiting_payment` tries its payment again at once and waits another hour; it
  never charges twice. A `409` `DOMAIN_ORDER_NOT_AWAITING_PAYMENT` (in `DOMAIN_ERROR_CODES`) when
  the order is not waiting for a payment. `payment_url` is now set only when the bank asks the
  customer to confirm a saved-card payment in US dollars, so `PaymentRequiredError.paymentUrl`
  can be undefined.
- HTTPS load balancers: `loadBalancers.create` and `update` take `protocol: "https"`,
  `certificate_id`, `tls_policy` and `redirect_http`, and a load balancer reports
  `certificate_fingerprint_sha256`.
- The vendored spec is the current public API, with DNS, domains, the container registry, IAM,
  certificates and HTTPS load balancers, so `spec/pending/` is empty again. `npm run generate` and
  the coverage test accept a missing `spec/pending/`.

## 0.3.0 (2026-11-06)

- `KubernetesFixedNodeSize` and `fixed_node_sizes` on the Kubernetes versions list: the zones
  that build nodes only at fixed sizes, one entry per size. Types regenerated from the current
  public API spec.

## 0.2.0 (2026-10-28)

- `client.migrate`, for moving from another cloud: `migrate.connections`
  (`list`, `listAll`, `create`, `get`, `update` for the name, role ARN or a retry, `delete`)
  connects an AWS account through a read-only role; `migrate.scans` (`list`, `listAll`,
  `start`, `get` with `{ include: "inventory" }`) reads what runs there; `migrate.migrations`
  (`list`, `listAll`, `create`, `get`, `rename`, `delete`, `updateItem`, `exportTerraform`) plans
  the move with a price comparison and a Terraform export.
- `migrate.connections.wait()` and `migrate.scans.wait()`, which reject with the new
  `CloudFailedError` when the connection or scan fails.
- `examples/migrate-from-aws.ts`.
- Types follow the current public API, including Kubernetes clusters' `node_health`,
  `ready_nodes` and `nodes_checked_at`, and a load balancer's `protocol`.
- Fixed: request fields the API defaults (`endpoint_access`, `control_nodes`, a firewall rule's
  `direction` and `action`, `algorithm`, `purpose`, `admin_username`, `retention_count`,
  `enabled`, `autoscaling_enabled`) are optional in the types, as they are in the API.
- Agent sessions, which answer only AI apps connected through Pantech's MCP server, have no
  methods yet; `scripts/not-in-sdk.json` lists them and `npm run generate` leaves out their types.

## 0.1.0 (2026-10-24)

- First release: a client for every operation in the Pantech Dynamics public API
  (`/public/v1`), with types generated from its OpenAPI spec.
- Automatic `Idempotency-Key` on every write, reused across retries; retries with
  backoff and `Retry-After` on network errors, 429, 500, 502, 503 and 504, except for
  writes the API does not replay.
- `PantechError` and its subclasses, carrying `status`, `code`, `title`, `detail`,
  `requestId` and field `errors`.
- `listAll()` async iterators, `operations.wait()`, `operations.stream()`, and
  `instanceOrders.wait()` / `databaseOrders.wait()`.
- `me.revoke()` (`DELETE /me`), and `kind` / `client_name` on `me.get()`.
- `verifyWebhook()` and `signWebhook()` on Web Crypto.
- ESM and CommonJS builds; Node.js 18+, Bun, Deno and edge runtimes.
