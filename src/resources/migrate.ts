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
 * Move from another cloud: connect it read-only (AWS, Google Cloud, Azure and
 * Huawei Cloud through short-lived tokens Pantech signs; DigitalOcean,
 * Hetzner, Linode, Vultr, Contabo and OpenStack through the Pantech Migrate
 * agent, which keeps your token on your machine), scan what runs there, plan
 * the move to Pantech with a price comparison and a Terraform export, then
 * copy buckets, servers, databases and Kubernetes clusters across.
 */
export class Migrate extends APIResource {
  /** The clouds Migrate can connect, and how it reads each. */
  readonly providers: CloudProviders = new CloudProviders(this._client);
  /** Read-only connections to your accounts in other clouds. */
  readonly connections: CloudConnections = new CloudConnections(this._client);
  /** Reads of everything a connection can see. */
  readonly scans: CloudScans = new CloudScans(this._client);
  /** Plans to move what a scan found to Pantech. Nothing is created until you apply the Terraform or start a copy. */
  readonly migrations: Migrations = new Migrations(this._client);
  /** A connection's opt-in copy access: the buckets Pantech may copy, through a separate copy role. */
  readonly copyAccess: CopyAccessResource = new CopyAccessResource(this._client);
  /** Copies of a source bucket's objects into a Pantech bucket. */
  readonly bucketImports: BucketImports = new BucketImports(this._client);
  /** Copies of a planned server's disks into a new Pantech instance. */
  readonly serverCopies: ServerCopies = new ServerCopies(this._client);
  /** Moves of a planned database into one of your Pantech databases, through the Migrate agent. */
  readonly databaseImports: DatabaseImports = new DatabaseImports(this._client);
  /** Moves of a planned Kubernetes cluster into one of your Pantech clusters. */
  readonly kubernetesMoves: KubernetesMoves = new KubernetesMoves(this._client);
}

export class CloudProviders extends APIResource {
  /**
   * Every cloud Migrate can connect: how it reads each (`federated` or
   * `agent`), and whether a scan reads its spend and its people.
   */
  list(options?: RequestOptions): Promise<R<"listCloudProviders">> {
    return this._get("/cloud-providers", undefined, options);
  }
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
   * Starts a connection to `provider` (`aws` when left out). Its `setup` says
   * what to run in your cloud: for AWS, the CloudFormation template (and,
   * when offered, a one-click `quick_create_url`) that creates the read-only
   * role, whose `RoleArn` output you send with `update`; for Google Cloud,
   * Azure and Huawei Cloud, a script whose output you send as `gcp`, `azure`
   * or `huawei` with `update`; for agent providers, how to make a read-only
   * token, then `enrollAgent`.
   */
  create(body: B<"createCloudConnection">, options?: RequestOptions): Promise<R<"createCloudConnection">> {
    return this._post("/cloud-connections", body, options);
  }

  get(connectionId: string, options?: RequestOptions): Promise<R<"getCloudConnection">> {
    return this._get(path`/cloud-connections/${connectionId}`, undefined, options);
  }

  /**
   * Renames the connection, sets its `role_arn` (AWS) or its `gcp`, `azure`
   * or `huawei` federation details, or retries a failed check (`retry: true`).
   */
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
   * A one-time enrollment code for the connection's Pantech Migrate agent,
   * valid once for an hour and shown only in this response. Any connection may
   * have an agent: on AWS, Google Cloud, Azure and Huawei Cloud it runs server
   * copies, database imports and Kubernetes moves (Pantech scans those clouds
   * itself); on the other clouds it scans too. A connection has one agent, so
   * using the code replaces the earlier one. Run its `enroll_command` where the
   * agent will run. Each call issues a new code (replacing any unused one), so
   * it is sent once and not retried.
   */
  enrollAgent(connectionId: string, options?: RequestOptions): Promise<R<"createCloudAgentEnrollment">> {
    return this._post(path`/cloud-connections/${connectionId}/agent-enrollments`, undefined, options, {
      noRetry: true,
    });
  }

  /**
   * Ends the connection's agent at once, and any server copy upload it was
   * running; the connection waits for a new one. Revoking again changes nothing.
   */
  revokeAgent(connectionId: string, options?: RequestOptions): Promise<R<"revokeCloudAgent">> {
    return this._delete(path`/cloud-connections/${connectionId}/agent`, options);
  }

  /**
   * Polls the connection until it is `connected` (resolves with it) or its
   * check fails (rejects with CloudFailedError). Set the role ARN or the
   * federation details with `update`, or enroll the agent, first. Default
   * timeout 10 minutes, polling every 5 seconds.
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

  /**
   * Sends Pantech invites to the people the plan lists (items of kind
   * `user`), by key, each with its item's role. Safe to repeat: anyone
   * already invited or already a member is reported, never invited twice.
   */
  sendInvites(
    migrationId: string,
    body: B<"sendMigrationInvites">,
    options?: RequestOptions,
  ): Promise<R<"sendMigrationInvites">> {
    return this._post(path`/migrations/${migrationId}/invites`, body, options);
  }
}

export class CopyAccessResource extends APIResource {
  /** The connection's copy access: the chosen buckets, the copy role and its last verification, and its template. */
  get(connectionId: string, options?: RequestOptions): Promise<R<"getCopyAccess">> {
    return this._get(path`/cloud-connections/${connectionId}/copy-access`, undefined, options);
  }

  /**
   * Chooses the buckets Pantech may copy (`buckets`, needed the first time)
   * and returns the CloudFormation template for a copy role that may read
   * only those. Deploy it, then set `role_arn` to its `CopyRoleArn` output;
   * `retry: true` verifies again.
   */
  set(connectionId: string, body: B<"putCopyAccess">, options?: RequestOptions): Promise<R<"putCopyAccess">> {
    return this._put(path`/cloud-connections/${connectionId}/copy-access`, body, options);
  }
}

export class BucketImports extends APIResource {
  /** The organization's bucket imports, newest first. */
  list(params: L<"listBucketImports"> = {}, options?: RequestOptions): Promise<R<"listBucketImports">> {
    return this._get("/bucket-imports", params, options);
  }

  listAll(params: LA<"listBucketImports"> = {}, options?: RequestOptions): AsyncGenerator<I<"listBucketImports">> {
    return this._listAll("/bucket-imports", params, options);
  }

  /**
   * Copies one source bucket (with verified copy access) into a new Pantech
   * bucket (`destination_bucket_name`) or one you have (`destination_bucket_id`).
   * Nothing is deleted on either side. Follow it with `get`.
   */
  start(body: B<"startBucketImport">, options?: RequestOptions): Promise<R<"startBucketImport">> {
    return this._post("/bucket-imports", body, options);
  }

  /** An import's status and progress, the first objects that failed it, and its audit trail. */
  get(importId: string, options?: RequestOptions): Promise<R<"getBucketImport">> {
    return this._get(path`/bucket-imports/${importId}`, undefined, options);
  }

  /** Stops the import: a queued one at once, a running one at its next checkpoint. Objects already copied stay. */
  cancel(importId: string, options?: RequestOptions): Promise<R<"cancelBucketImport">> {
    return this._post(path`/bucket-imports/${importId}/cancel`, undefined, options);
  }

  /**
   * Queues another pass that copies only what changed. `mirror_deletes: true`
   * (that pass only, needs the `delete` scope) also deletes the objects this
   * import copied that the source no longer has.
   */
  resync(
    importId: string,
    body: B<"resyncBucketImport"> = {},
    options?: RequestOptions,
  ): Promise<R<"resyncBucketImport">> {
    return this._post(path`/bucket-imports/${importId}/resync`, body, options);
  }
}

export class ServerCopies extends APIResource {
  /** Every server copy in your organization, newest first, with its progress. */
  list(params: L<"listServerCopies"> = {}, options?: RequestOptions): Promise<R<"listServerCopies">> {
    return this._get("/server-copies", params, options);
  }

  listAll(params: LA<"listServerCopies"> = {}, options?: RequestOptions): AsyncGenerator<I<"listServerCopies">> {
    return this._listAll("/server-copies", params, options);
  }

  /**
   * Starts copying one planned server's disks (`item_key`) into a new Pantech
   * instance. The first pass copies every disk; `sync` copies what changed and
   * `cutOver` runs the last pass and builds the instance. `source` is `agent`
   * (the default) or `aws_snapshot`, with a copy role from `getTemplate`.
   */
  start(migrationId: string, body: B<"startServerCopy">, options?: RequestOptions): Promise<R<"startServerCopy">> {
    return this._post(path`/migrations/${migrationId}/server-copies`, body, options);
  }

  /**
   * The CloudFormation template of the AWS copy role for one planned server
   * (`item_key`); with `create_snapshots: true` it may also snapshot that
   * server's own volumes.
   */
  getTemplate(
    migrationId: string,
    params: Q<"getServerCopyTemplate">,
    options?: RequestOptions,
  ): Promise<R<"getServerCopyTemplate">> {
    return this._get(path`/migrations/${migrationId}/server-copy-template`, params, options);
  }

  /** A copy's status, pre-flight findings, running pass and progress, and the instance once it is being created. */
  get(copyId: string, options?: RequestOptions): Promise<R<"getServerCopy">> {
    return this._get(path`/server-copies/${copyId}`, undefined, options);
  }

  /** Asks for a pass that copies only what changed. An AWS copy that makes no snapshots names each disk's new one in `snapshots`. */
  sync(copyId: string, body: B<"syncServerCopy"> = {}, options?: RequestOptions): Promise<R<"syncServerCopy">> {
    return this._post(path`/server-copies/${copyId}/sync`, body, options);
  }

  /** Asks for the last pass, then builds the instance. Stop the application first. */
  cutOver(
    copyId: string,
    body: B<"cutOverServerCopy"> = {},
    options?: RequestOptions,
  ): Promise<R<"cutOverServerCopy">> {
    return this._post(path`/server-copies/${copyId}/cutover`, body, options);
  }

  /** Stops the copy and deletes what Pantech staged for it. Refused once the instance is being created. */
  cancel(copyId: string, body: B<"cancelServerCopy"> = {}, options?: RequestOptions): Promise<R<"cancelServerCopy">> {
    return this._post(path`/server-copies/${copyId}/cancel`, body, options);
  }
}

export class DatabaseImports extends APIResource {
  /** Your organization's database imports, newest first, without their tables. */
  list(params: L<"listDatabaseImports"> = {}, options?: RequestOptions): Promise<R<"listDatabaseImports">> {
    return this._get("/database-imports", params, options);
  }

  listAll(params: LA<"listDatabaseImports"> = {}, options?: RequestOptions): AsyncGenerator<I<"listDatabaseImports">> {
    return this._listAll("/database-imports", params, options);
  }

  /**
   * Starts moving one of the plan's databases (`item_key`) into one of your
   * Pantech databases, through the Migrate agent, which keeps the source's
   * credentials. `dump` copies once; `replicate` (PostgreSQL) follows changes
   * until you cut over.
   */
  start(
    migrationId: string,
    body: B<"startDatabaseImport">,
    options?: RequestOptions,
  ): Promise<R<"startDatabaseImport">> {
    return this._post(path`/migrations/${migrationId}/database-imports`, body, options);
  }

  /** An import with its readiness report, per-table progress and verification. */
  get(importId: string, options?: RequestOptions): Promise<R<"getDatabaseImport">> {
    return this._get(path`/database-imports/${importId}`, undefined, options);
  }

  /** Runs the pre-flight again, for example after fixing what it reported. Allowed before the copy starts. */
  checkReadiness(importId: string, options?: RequestOptions): Promise<R<"checkDatabaseImportReadiness">> {
    return this._post(path`/database-imports/${importId}/readiness`, undefined, options);
  }

  /** Finishes the import. For `replicate`, stop writes to the source first. */
  cutOver(importId: string, options?: RequestOptions): Promise<R<"cutOverDatabaseImport">> {
    return this._post(path`/database-imports/${importId}/cutover`, undefined, options);
  }

  /** Stops the import and removes its access to your Pantech database. What was copied stays. */
  cancel(importId: string, options?: RequestOptions): Promise<R<"cancelDatabaseImport">> {
    return this._post(path`/database-imports/${importId}/cancel`, undefined, options);
  }

  /** Removes the import's login and access from your Pantech database now, keeping the data. */
  revokeAccess(importId: string, options?: RequestOptions): Promise<R<"revokeDatabaseImportAccess">> {
    return this._post(path`/database-imports/${importId}/revoke-access`, undefined, options);
  }
}

export class KubernetesMoves extends APIResource {
  /** Your organization's moves, newest first, without their resources and volumes. */
  list(params: L<"listKubernetesMoves"> = {}, options?: RequestOptions): Promise<R<"listKubernetesMoves">> {
    return this._get("/kubernetes-moves", params, options);
  }

  listAll(params: LA<"listKubernetesMoves"> = {}, options?: RequestOptions): AsyncGenerator<I<"listKubernetesMoves">> {
    return this._listAll("/kubernetes-moves", params, options);
  }

  /**
   * Starts moving a plan's `kubernetes_cluster` item into one of your running
   * Pantech clusters. Secrets move only with `include_secrets`, volume data
   * only with `copy_volumes`. Then `preview`, `apply`, and `cutOver`.
   */
  start(
    migrationId: string,
    body: B<"startKubernetesMove">,
    options?: RequestOptions,
  ): Promise<R<"startKubernetesMove">> {
    return this._post(path`/migrations/${migrationId}/kubernetes-moves`, body, options);
  }

  /** The manifests to apply to the source cluster: a read-only reader, and optional Secrets reader and volume copier roles. */
  getSourceAccess(options?: RequestOptions): Promise<R<"getKubernetesMoveSourceAccess">> {
    return this._get("/kubernetes-moves/source-access", undefined, options);
  }

  /** A move with its report: every source object and what the move does with it, the volumes, images and held workloads. */
  get(moveId: string, options?: RequestOptions): Promise<R<"getKubernetesMove">> {
    return this._get(path`/kubernetes-moves/${moveId}`, undefined, options);
  }

  /** Queues a server-side dry run against the target cluster. `allow_privileged` names refused workloads to include anyway. */
  preview(
    moveId: string,
    body: B<"previewKubernetesMove"> = {},
    options?: RequestOptions,
  ): Promise<R<"previewKubernetesMove">> {
    return this._post(path`/kubernetes-moves/${moveId}/preview`, body, options);
  }

  /** Queues the apply of what the last successful preview checked. */
  apply(moveId: string, options?: RequestOptions): Promise<R<"applyKubernetesMove">> {
    return this._post(path`/kubernetes-moves/${moveId}/apply`, undefined, options);
  }

  /** Queues the next copy of every volume; only what changed is sent. */
  syncVolumes(moveId: string, options?: RequestOptions): Promise<R<"syncKubernetesMoveVolumes">> {
    return this._post(path`/kubernetes-moves/${moveId}/sync-volumes`, undefined, options);
  }

  /**
   * Once writes on the source have stopped (`source_writes_stopped: true`),
   * takes the final copy of every volume and scales the held workloads up.
   */
  cutOver(
    moveId: string,
    body: B<"cutoverKubernetesMove">,
    options?: RequestOptions,
  ): Promise<R<"cutoverKubernetesMove">> {
    return this._post(path`/kubernetes-moves/${moveId}/cutover`, body, options);
  }

  /** Stops the move and removes its copy pods, staged data and export. Objects already applied stay. */
  cancel(moveId: string, options?: RequestOptions): Promise<R<"cancelKubernetesMove">> {
    return this._post(path`/kubernetes-moves/${moveId}/cancel`, undefined, options);
  }

  /** The transformed manifests as one YAML file, for GitOps. Secret values are never included. */
  downloadManifests(moveId: string, options?: RequestOptions): Promise<string> {
    return this._request(
      "GET",
      path`/kubernetes-moves/${moveId}/manifests`,
      { responseType: "text" },
      { ...options, headers: { Accept: "application/yaml", ...options?.headers } },
    );
  }
}
