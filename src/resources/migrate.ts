import type { RequestOptions } from "../client.js";
import { CloudFailedError } from "../errors.js";
import type { CloudConnection, CloudFailure, CloudScan } from "../models.js";
import { APIResource } from "../resource.js";
import type {
  BodyOf as B,
  ItemOf as I,
  ListParams as L,
  ListAllParams as LA,
  QueryOf as Q,
  ResponseOf as R,
} from "../types.js";
import { path } from "../util.js";
import { poll, type WaitOptions } from "../wait.js";

const CONNECTION_WAIT_MS = 10 * 60_000;
const SCAN_WAIT_MS = 30 * 60_000;

function cloudFailed(kind: "connection" | "scan", id: string, failure: CloudFailure, resource: unknown) {
  const detail = failure?.message ?? `The ${kind} failed.`;
  const code = failure?.code;
  return new CloudFailedError(
    code ? `Cloud ${kind} ${id} failed: ${detail} (${code})` : `Cloud ${kind} ${id} failed: ${detail}`,
    kind,
    resource,
    { code, detail },
  );
}

/**
 * Move from another cloud: connect an AWS account through a read-only role
 * (no access keys are shared), scan what runs there, and plan the move to
 * Pantech with a price comparison and a Terraform export.
 */
export class Migrate extends APIResource {
  /** Connections to AWS accounts through a read-only role only Pantech can assume. */
  readonly connections: CloudConnections = new CloudConnections(this._client);
  /** Reads of everything a connection's role can see. */
  readonly scans: CloudScans = new CloudScans(this._client);
  /** Plans to move what a scan found to Pantech. Nothing is created until you apply the Terraform. */
  readonly migrations: Migrations = new Migrations(this._client);
}

export class CloudConnections extends APIResource {
  list(params: L<"listCloudConnections"> = {}, options?: RequestOptions): Promise<R<"listCloudConnections">> {
    return this._get("/cloud-connections", params, options);
  }

  listAll(
    params: LA<"listCloudConnections"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listCloudConnections">> {
    return this._listAll("/cloud-connections", params, options);
  }

  /**
   * Starts a connection. Its `setup` holds the CloudFormation template (and,
   * when offered, a one-click `quick_create_url`) that creates the read-only
   * role in your AWS account; send the stack's `RoleArn` output with `update`.
   */
  create(body: B<"createCloudConnection">, options?: RequestOptions): Promise<R<"createCloudConnection">> {
    return this._post("/cloud-connections", body, options);
  }

  get(connectionId: string, options?: RequestOptions): Promise<R<"getCloudConnection">> {
    return this._get(path`/cloud-connections/${connectionId}`, undefined, options);
  }

  /** Renames the connection, sets its `role_arn`, or retries a failed check (`retry: true`). */
  update(
    connectionId: string,
    body: B<"updateCloudConnection">,
    options?: RequestOptions,
  ): Promise<R<"updateCloudConnection">> {
    return this._patch(path`/cloud-connections/${connectionId}`, body, options);
  }

  /** Removes the connection and its scans; plans made from it stay. Delete the stack in AWS to revoke the role there. */
  delete(connectionId: string, options?: RequestOptions): Promise<void> {
    return this._delete(path`/cloud-connections/${connectionId}`, options);
  }

  /**
   * Polls the connection until it is `connected` (resolves with it) or its
   * check fails (rejects with CloudFailedError). Set the role ARN with
   * `update` first. Default timeout 10 minutes, polling every 5 seconds.
   */
  wait(connectionId: string, options: WaitOptions<CloudConnection> = {}): Promise<CloudConnection> {
    return poll(
      () => this.get(connectionId, { signal: options.signal }),
      (c) => {
        if (c.status === "failed") throw cloudFailed("connection", c.id, c.failure, c);
        return c.status === "connected";
      },
      `Cloud connection ${connectionId}`,
      { timeoutMs: CONNECTION_WAIT_MS, pollIntervalMs: 5_000, ...options },
    );
  }
}

export class CloudScans extends APIResource {
  /** A connection's scans, newest first, without their inventories. */
  list(connectionId: string, params: L<"listCloudScans"> = {}, options?: RequestOptions): Promise<R<"listCloudScans">> {
    return this._get(path`/cloud-connections/${connectionId}/scans`, params, options);
  }

  listAll(
    connectionId: string,
    params: LA<"listCloudScans"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listCloudScans">> {
    return this._listAll(path`/cloud-connections/${connectionId}/scans`, params, options);
  }

  /** Queues a scan of a connected account. Follow it with `wait`. */
  start(connectionId: string, options?: RequestOptions): Promise<R<"startCloudScan">> {
    return this._post(path`/cloud-connections/${connectionId}/scans`, undefined, options);
  }

  /** A scan's status and counts. Pass `{ include: "inventory" }` for everything it found. */
  get(scanId: string, params: Q<"getCloudScan"> = {}, options?: RequestOptions): Promise<R<"getCloudScan">> {
    return this._get(path`/cloud-scans/${scanId}`, params, options);
  }

  /**
   * Polls the scan until it `succeeded` (resolves with it, without its
   * inventory) or failed (rejects with CloudFailedError). Default timeout 30
   * minutes, polling every 10 seconds.
   */
  wait(scanId: string, options: WaitOptions<CloudScan> = {}): Promise<CloudScan> {
    return poll(
      () => this.get(scanId, {}, { signal: options.signal }),
      (s) => {
        if (s.status === "failed") throw cloudFailed("scan", s.id, s.failure, s);
        return s.status === "succeeded";
      },
      `Cloud scan ${scanId}`,
      { timeoutMs: SCAN_WAIT_MS, pollIntervalMs: 10_000, ...options },
    );
  }
}

export class Migrations extends APIResource {
  /** Your migration plans, newest first, without their items or estimate. */
  list(params: L<"listMigrations"> = {}, options?: RequestOptions): Promise<R<"listMigrations">> {
    return this._get("/migrations", params, options);
  }

  listAll(params: LA<"listMigrations"> = {}, options?: RequestOptions): AsyncGenerator<I<"listMigrations">> {
    return this._listAll("/migrations", params, options);
  }

  /** Builds a plan, with a price comparison, from a scan that succeeded. Nothing is created on Pantech. */
  create(body: B<"createMigration">, options?: RequestOptions): Promise<R<"createMigration">> {
    return this._post("/migrations", body, options);
  }

  /** A plan with every item, and a price comparison computed now. */
  get(migrationId: string, options?: RequestOptions): Promise<R<"getMigration">> {
    return this._get(path`/migrations/${migrationId}`, undefined, options);
  }

  rename(migrationId: string, body: B<"renameMigration">, options?: RequestOptions): Promise<R<"renameMigration">> {
    return this._patch(path`/migrations/${migrationId}`, body, options);
  }

  /** Deletes the plan. Nothing on Pantech or in the other cloud is touched. */
  delete(migrationId: string, options?: RequestOptions): Promise<void> {
    return this._delete(path`/migrations/${migrationId}`, options);
  }

  /** Changes one item, named by its `key`: exclude it, or change its plan, size, range, role or email. */
  updateItem(
    migrationId: string,
    body: B<"updateMigrationItem">,
    options?: RequestOptions,
  ): Promise<R<"updateMigrationItem">> {
    return this._patch(path`/migrations/${migrationId}/items`, body, options);
  }

  /** The plan's planned items as Terraform: `main.tf` and `variables.tf`. */
  exportTerraform(migrationId: string, options?: RequestOptions): Promise<R<"exportMigrationTerraform">> {
    return this._get(path`/migrations/${migrationId}/terraform`, undefined, options);
  }
}
