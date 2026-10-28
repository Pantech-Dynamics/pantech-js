# Changelog

A new version heading here (`## X.Y.Z (YYYY-MM-DD)`) pushed to main is
tagged `vX.Y.Z` and published to npm. Add changes under `## Unreleased`
until then.

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
