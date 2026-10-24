import type { RequestOptions } from "../client.js";
import { type OrderRef, type OrderWaitOptions, orderId, waitForOrder } from "../orders.js";
import { APIResource } from "../resource.js";
import type { BodyOf as B, ItemOf as I, ListParams as L, ListAllParams as LA, ResponseOf as R } from "../types.js";
import { path } from "../util.js";

/** Managed PostgreSQL, MySQL and MariaDB databases. */
export class Databases extends APIResource {
  /** Snapshots of a database. */
  readonly snapshots: DatabaseSnapshots = new DatabaseSnapshots(this._client);

  list(params: L<"listDatabases"> = {}, options?: RequestOptions): Promise<R<"listDatabases">> {
    return this._get("/databases", params, options);
  }

  listAll(params: LA<"listDatabases"> = {}, options?: RequestOptions): AsyncGenerator<I<"listDatabases">> {
    return this._listAll("/databases", params, options);
  }

  /**
   * Orders a database. A generated admin password is in this response only;
   * follow the order with `client.databaseOrders.wait(order)`.
   */
  create(body: B<"createDatabase">, options?: RequestOptions): Promise<R<"createDatabase">> {
    return this._post("/databases", body, options);
  }

  get(databaseId: string, options?: RequestOptions): Promise<R<"getDatabase">> {
    return this._get(path`/databases/${databaseId}`, undefined, options);
  }

  delete(databaseId: string, options?: RequestOptions): Promise<R<"deleteDatabase">> {
    return this._delete(path`/databases/${databaseId}`, options);
  }

  /** Replaces the CIDRs allowed to connect. */
  replaceAccessRules(
    databaseId: string,
    body: B<"replaceDatabaseAccessRules">,
    options?: RequestOptions,
  ): Promise<R<"replaceDatabaseAccessRules">> {
    return this._put(path`/databases/${databaseId}/access-rules`, body, options);
  }

  /** Replaces the attached security groups. */
  setSecurityGroups(
    databaseId: string,
    body: B<"setDatabaseSecurityGroups">,
    options?: RequestOptions,
  ): Promise<R<"setDatabaseSecurityGroups">> {
    return this._put(path`/databases/${databaseId}/security-groups`, body, options);
  }

  changePassword(
    databaseId: string,
    body: B<"changeDatabasePassword">,
    options?: RequestOptions,
  ): Promise<R<"changeDatabasePassword">> {
    return this._put(path`/databases/${databaseId}/password`, body, options);
  }

  /** Generates a new admin password, returned in this response only. */
  resetPassword(databaseId: string, options?: RequestOptions): Promise<R<"resetDatabasePassword">> {
    return this._post(path`/databases/${databaseId}/reset-password`, undefined, options);
  }

  start(databaseId: string, options?: RequestOptions): Promise<R<"startDatabase">> {
    return this._post(path`/databases/${databaseId}/start`, undefined, options);
  }

  stop(databaseId: string, options?: RequestOptions): Promise<R<"stopDatabase">> {
    return this._post(path`/databases/${databaseId}/stop`, undefined, options);
  }

  resizeStorage(
    databaseId: string,
    body: B<"resizeDatabaseStorage">,
    options?: RequestOptions,
  ): Promise<R<"resizeDatabaseStorage">> {
    return this._post(path`/databases/${databaseId}/resize-storage`, body, options);
  }
}

export class DatabaseSnapshots extends APIResource {
  list(
    databaseId: string,
    params: L<"listDatabaseSnapshots"> = {},
    options?: RequestOptions,
  ): Promise<R<"listDatabaseSnapshots">> {
    return this._get(path`/databases/${databaseId}/snapshots`, params, options);
  }

  listAll(
    databaseId: string,
    params: LA<"listDatabaseSnapshots"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listDatabaseSnapshots">> {
    return this._listAll(path`/databases/${databaseId}/snapshots`, params, options);
  }

  create(
    databaseId: string,
    body: B<"createDatabaseSnapshot">,
    options?: RequestOptions,
  ): Promise<R<"createDatabaseSnapshot">> {
    return this._post(path`/databases/${databaseId}/snapshots`, body, options);
  }

  get(databaseId: string, snapshotId: string, options?: RequestOptions): Promise<R<"getDatabaseSnapshot">> {
    return this._get(path`/databases/${databaseId}/snapshots/${snapshotId}`, undefined, options);
  }

  delete(databaseId: string, snapshotId: string, options?: RequestOptions): Promise<R<"deleteDatabaseSnapshot">> {
    return this._delete(path`/databases/${databaseId}/snapshots/${snapshotId}`, options);
  }
}

/** How a new database is paid for and provisioned. */
export class DatabaseOrders extends APIResource {
  list(params: L<"listDatabaseOrders"> = {}, options?: RequestOptions): Promise<R<"listDatabaseOrders">> {
    return this._get("/database-orders", params, options);
  }

  listAll(params: LA<"listDatabaseOrders"> = {}, options?: RequestOptions): AsyncGenerator<I<"listDatabaseOrders">> {
    return this._listAll("/database-orders", params, options);
  }

  get(orderId: string, options?: RequestOptions): Promise<R<"getDatabaseOrder">> {
    return this._get(path`/database-orders/${orderId}`, undefined, options);
  }

  /**
   * Polls the order until it is provisioned and (by default) the database's
   * create operation has finished. Rejects with OrderFailedError or
   * OperationFailedError. Accepts an id or the body `databases.create` returned.
   */
  wait(ref: OrderRef, options: OrderWaitOptions<R<"getDatabaseOrder">> = {}): Promise<R<"getDatabaseOrder">> {
    const id = orderId(ref);
    return waitForOrder(this._client, (signal) => this.get(id, { signal }), `Database order ${id}`, options);
  }
}
