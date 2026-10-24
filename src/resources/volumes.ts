import type { RequestOptions } from "../client.js";
import { APIResource } from "../resource.js";
import type { BodyOf as B, ItemOf as I, ListParams as L, ListAllParams as LA, ResponseOf as R } from "../types.js";
import { path } from "../util.js";

/** Data disks. */
export class Volumes extends APIResource {
  /** Snapshots of a volume. */
  readonly snapshots: VolumeSnapshots = new VolumeSnapshots(this._client);

  list(params: L<"listVolumes"> = {}, options?: RequestOptions): Promise<R<"listVolumes">> {
    return this._get("/volumes", params, options);
  }

  listAll(params: LA<"listVolumes"> = {}, options?: RequestOptions): AsyncGenerator<I<"listVolumes">> {
    return this._listAll("/volumes", params, options);
  }

  create(body: B<"createVolume">, options?: RequestOptions): Promise<R<"createVolume">> {
    return this._post("/volumes", body, options);
  }

  get(volumeId: string, options?: RequestOptions): Promise<R<"getVolume">> {
    return this._get(path`/volumes/${volumeId}`, undefined, options);
  }

  delete(volumeId: string, options?: RequestOptions): Promise<R<"deleteVolume">> {
    return this._delete(path`/volumes/${volumeId}`, options);
  }

  attach(volumeId: string, body: B<"attachVolume">, options?: RequestOptions): Promise<R<"attachVolume">> {
    return this._post(path`/volumes/${volumeId}/attach`, body, options);
  }

  detach(volumeId: string, options?: RequestOptions): Promise<R<"detachVolume">> {
    return this._post(path`/volumes/${volumeId}/detach`, undefined, options);
  }

  /** Grows a detached volume. */
  resize(volumeId: string, body: B<"resizeVolume">, options?: RequestOptions): Promise<R<"resizeVolume">> {
    return this._post(path`/volumes/${volumeId}/resize`, body, options);
  }

  usage(volumeId: string, options?: RequestOptions): Promise<R<"getVolumeUsage">> {
    return this._get(path`/volumes/${volumeId}/usage`, undefined, options);
  }

  getSnapshotSchedule(volumeId: string, options?: RequestOptions): Promise<R<"getVolumeSnapshotSchedule">> {
    return this._get(path`/volumes/${volumeId}/snapshot-schedule`, undefined, options);
  }

  setSnapshotSchedule(
    volumeId: string,
    body: B<"putVolumeSnapshotSchedule">,
    options?: RequestOptions,
  ): Promise<R<"putVolumeSnapshotSchedule">> {
    return this._put(path`/volumes/${volumeId}/snapshot-schedule`, body, options);
  }
}

export class VolumeSnapshots extends APIResource {
  list(
    volumeId: string,
    params: L<"listVolumeSnapshots"> = {},
    options?: RequestOptions,
  ): Promise<R<"listVolumeSnapshots">> {
    return this._get(path`/volumes/${volumeId}/snapshots`, params, options);
  }

  listAll(
    volumeId: string,
    params: LA<"listVolumeSnapshots"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listVolumeSnapshots">> {
    return this._listAll(path`/volumes/${volumeId}/snapshots`, params, options);
  }

  create(
    volumeId: string,
    body: B<"createVolumeSnapshot">,
    options?: RequestOptions,
  ): Promise<R<"createVolumeSnapshot">> {
    return this._post(path`/volumes/${volumeId}/snapshots`, body, options);
  }
}
