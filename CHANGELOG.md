# Changelog

A new version heading here (`## X.Y.Z (YYYY-MM-DD)`) pushed to main is
tagged `vX.Y.Z` and published to npm. Add changes under `## Unreleased`
until then.

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
