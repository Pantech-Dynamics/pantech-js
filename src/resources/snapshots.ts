import type { RequestOptions } from "../client.js";
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

/** Point-in-time copies of root disks and volumes. */
export class Snapshots extends APIResource {
  list(params: L<"listSnapshots"> = {}, options?: RequestOptions): Promise<R<"listSnapshots">> {
    return this._get("/snapshots", params, options);
  }

  listAll(params: LA<"listSnapshots"> = {}, options?: RequestOptions): AsyncGenerator<I<"listSnapshots">> {
    return this._listAll("/snapshots", params, options);
  }

  /** What a snapshot of `size_gb` costs. */
  quote(params: Q<"quoteSnapshot">, options?: RequestOptions): Promise<R<"quoteSnapshot">> {
    return this._get("/snapshots/quote", params, options);
  }

  get(snapshotId: string, options?: RequestOptions): Promise<R<"getSnapshot">> {
    return this._get(path`/snapshots/${snapshotId}`, undefined, options);
  }

  delete(snapshotId: string, options?: RequestOptions): Promise<R<"deleteSnapshot">> {
    return this._delete(path`/snapshots/${snapshotId}`, options);
  }

  /** Restores the snapshot into a new volume. */
  restore(snapshotId: string, body: B<"restoreSnapshot">, options?: RequestOptions): Promise<R<"restoreSnapshot">> {
    return this._post(path`/snapshots/${snapshotId}/restore`, body, options);
  }

  usage(snapshotId: string, options?: RequestOptions): Promise<R<"getSnapshotUsage">> {
    return this._get(path`/snapshots/${snapshotId}/usage`, undefined, options);
  }
}
