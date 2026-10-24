import type { RequestOptions } from "../client.js";
import { type OrderRef, type OrderWaitOptions, orderId, waitForOrder } from "../orders.js";
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

/** Virtual machines: create, power, change, delete. */
export class Instances extends APIResource {
  /** Snapshots of an instance's root disk. */
  readonly snapshots: InstanceSnapshots = new InstanceSnapshots(this._client);
  /** Short-lived SSH access grants through the browser terminal relay. */
  readonly sshAccess: InstanceSshAccess = new InstanceSshAccess(this._client);

  /** One page of your instances. */
  list(params: L<"listInstances"> = {}, options?: RequestOptions): Promise<R<"listInstances">> {
    return this._get("/instances", params, options);
  }

  /** Every instance: `for await (const vm of client.instances.listAll())`. */
  listAll(params: LA<"listInstances"> = {}, options?: RequestOptions): AsyncGenerator<I<"listInstances">> {
    return this._listAll("/instances", params, options);
  }

  /**
   * Orders an instance. The initial payment is taken first, then it is
   * provisioned: follow the order with `client.instanceOrders.wait(order)`.
   */
  create(body: B<"createInstance">, options?: RequestOptions): Promise<R<"createInstance">> {
    return this._post("/instances", body, options);
  }

  get(instanceId: string, options?: RequestOptions): Promise<R<"getInstance">> {
    return this._get(path`/instances/${instanceId}`, undefined, options);
  }

  delete(instanceId: string, options?: RequestOptions): Promise<R<"deleteInstance">> {
    return this._delete(path`/instances/${instanceId}`, options);
  }

  start(instanceId: string, options?: RequestOptions): Promise<R<"startInstance">> {
    return this._post(path`/instances/${instanceId}/start`, undefined, options);
  }

  stop(instanceId: string, options?: RequestOptions): Promise<R<"stopInstance">> {
    return this._post(path`/instances/${instanceId}/stop`, undefined, options);
  }

  reboot(instanceId: string, options?: RequestOptions): Promise<R<"rebootInstance">> {
    return this._post(path`/instances/${instanceId}/reboot`, undefined, options);
  }

  /** Reinstalls the root disk from an image. Everything on it is lost. */
  rebuild(instanceId: string, body: B<"rebuildInstance">, options?: RequestOptions): Promise<R<"rebuildInstance">> {
    return this._post(path`/instances/${instanceId}/rebuild`, body, options);
  }

  rename(instanceId: string, body: B<"renameInstance">, options?: RequestOptions): Promise<R<"renameInstance">> {
    return this._post(path`/instances/${instanceId}/rename`, body, options);
  }

  /** Moves the instance to a bigger plan. */
  resize(instanceId: string, body: B<"resizeInstance">, options?: RequestOptions): Promise<R<"resizeInstance">> {
    return this._post(path`/instances/${instanceId}/resize`, body, options);
  }

  changeSshKey(
    instanceId: string,
    body: B<"changeInstanceSSHKey">,
    options?: RequestOptions,
  ): Promise<R<"changeInstanceSSHKey">> {
    return this._post(path`/instances/${instanceId}/change-ssh-key`, body, options);
  }

  /** Restores the root disk from a snapshot. Changes since then are lost. */
  restore(instanceId: string, body: B<"restoreInstance">, options?: RequestOptions): Promise<R<"restoreInstance">> {
    return this._post(path`/instances/${instanceId}/restore`, body, options);
  }

  changeSecurityGroup(
    instanceId: string,
    body: B<"changeInstanceSecurityGroup">,
    options?: RequestOptions,
  ): Promise<R<"changeInstanceSecurityGroup">> {
    return this._put(path`/instances/${instanceId}/security-group`, body, options);
  }

  attachPrivateNetwork(instanceId: string, options?: RequestOptions): Promise<R<"attachInstancePrivateNetwork">> {
    return this._post(path`/instances/${instanceId}/private-network`, undefined, options);
  }

  detachPrivateNetwork(instanceId: string, options?: RequestOptions): Promise<R<"detachInstancePrivateNetwork">> {
    return this._delete(path`/instances/${instanceId}/private-network`, options);
  }

  /** A short-lived URL to the instance's console. Sent once: the API does not replay it. */
  openConsole(instanceId: string, options?: RequestOptions): Promise<R<"openInstanceConsole">> {
    return this._post(path`/instances/${instanceId}/console`, undefined, options, { noRetry: true });
  }

  /** Issues a credential that unlocks the instance's encrypted volumes. Sent once: the API does not replay it. */
  issueVolumeKeyCredential(instanceId: string, options?: RequestOptions): Promise<R<"issueVolumeKeyCredential">> {
    return this._post(path`/instances/${instanceId}/volume-key-credential`, undefined, options, { noRetry: true });
  }

  metrics(
    instanceId: string,
    params: Q<"getInstanceMetrics"> = {},
    options?: RequestOptions,
  ): Promise<R<"getInstanceMetrics">> {
    return this._get(path`/instances/${instanceId}/metrics`, params, options);
  }

  usage(instanceId: string, options?: RequestOptions): Promise<R<"getInstanceUsage">> {
    return this._get(path`/instances/${instanceId}/usage`, undefined, options);
  }

  /** One page of the volumes attached to the instance. */
  listVolumes(
    instanceId: string,
    params: L<"listInstanceVolumes"> = {},
    options?: RequestOptions,
  ): Promise<R<"listInstanceVolumes">> {
    return this._get(path`/instances/${instanceId}/volumes`, params, options);
  }

  listAllVolumes(
    instanceId: string,
    params: LA<"listInstanceVolumes"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listInstanceVolumes">> {
    return this._listAll(path`/instances/${instanceId}/volumes`, params, options);
  }

  getSnapshotSchedule(instanceId: string, options?: RequestOptions): Promise<R<"getInstanceSnapshotSchedule">> {
    return this._get(path`/instances/${instanceId}/snapshot-schedule`, undefined, options);
  }

  setSnapshotSchedule(
    instanceId: string,
    body: B<"putInstanceSnapshotSchedule">,
    options?: RequestOptions,
  ): Promise<R<"putInstanceSnapshotSchedule">> {
    return this._put(path`/instances/${instanceId}/snapshot-schedule`, body, options);
  }
}

export class InstanceSnapshots extends APIResource {
  list(
    instanceId: string,
    params: L<"listInstanceSnapshots"> = {},
    options?: RequestOptions,
  ): Promise<R<"listInstanceSnapshots">> {
    return this._get(path`/instances/${instanceId}/snapshots`, params, options);
  }

  listAll(
    instanceId: string,
    params: LA<"listInstanceSnapshots"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listInstanceSnapshots">> {
    return this._listAll(path`/instances/${instanceId}/snapshots`, params, options);
  }

  create(
    instanceId: string,
    body: B<"createInstanceSnapshot">,
    options?: RequestOptions,
  ): Promise<R<"createInstanceSnapshot">> {
    return this._post(path`/instances/${instanceId}/snapshots`, body, options);
  }
}

export class InstanceSshAccess extends APIResource {
  open(instanceId: string, options?: RequestOptions): Promise<R<"openSSHAccess">> {
    return this._post(path`/instances/${instanceId}/ssh-access`, undefined, options);
  }

  get(instanceId: string, grantId: string, options?: RequestOptions): Promise<R<"getSSHAccess">> {
    return this._get(path`/instances/${instanceId}/ssh-access/${grantId}`, undefined, options);
  }

  revoke(instanceId: string, grantId: string, options?: RequestOptions): Promise<R<"revokeSSHAccess">> {
    return this._delete(path`/instances/${instanceId}/ssh-access/${grantId}`, options);
  }
}

/** How a new instance is paid for and provisioned. */
export class InstanceOrders extends APIResource {
  list(params: L<"listInstanceOrders"> = {}, options?: RequestOptions): Promise<R<"listInstanceOrders">> {
    return this._get("/instance-orders", params, options);
  }

  listAll(params: LA<"listInstanceOrders"> = {}, options?: RequestOptions): AsyncGenerator<I<"listInstanceOrders">> {
    return this._listAll("/instance-orders", params, options);
  }

  get(orderId: string, options?: RequestOptions): Promise<R<"getInstanceOrder">> {
    return this._get(path`/instance-orders/${orderId}`, undefined, options);
  }

  /**
   * Polls the order until it is provisioned and (by default) the instance's
   * create operation has finished. Rejects with OrderFailedError when the
   * order fails or cannot be paid, and OperationFailedError when the create
   * fails. Accepts an id or the body `instances.create` returned.
   */
  wait(ref: OrderRef, options: OrderWaitOptions<R<"getInstanceOrder">> = {}): Promise<R<"getInstanceOrder">> {
    const id = orderId(ref);
    return waitForOrder(this._client, (signal) => this.get(id, { signal }), `Instance order ${id}`, options);
  }
}
