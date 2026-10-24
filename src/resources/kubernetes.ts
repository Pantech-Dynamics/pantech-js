import type { RequestOptions } from "../client.js";
import { APIResource } from "../resource.js";
import type { BodyOf as B, ItemOf as I, ListParams as L, ListAllParams as LA, ResponseOf as R } from "../types.js";
import { path } from "../util.js";

/** Managed Kubernetes clusters whose nodes are VMs in your account. */
export class Kubernetes extends APIResource {
  /** A cluster's node pools. */
  readonly nodePools: KubernetesNodePools = new KubernetesNodePools(this._client);
  /** A cluster's add-ons. */
  readonly addons: KubernetesAddons = new KubernetesAddons(this._client);

  list(params: L<"listKubernetesClusters"> = {}, options?: RequestOptions): Promise<R<"listKubernetesClusters">> {
    return this._get("/kubernetes-clusters", params, options);
  }

  listAll(
    params: LA<"listKubernetesClusters"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listKubernetesClusters">> {
    return this._listAll("/kubernetes-clusters", params, options);
  }

  create(body: B<"createKubernetesCluster">, options?: RequestOptions): Promise<R<"createKubernetesCluster">> {
    return this._post("/kubernetes-clusters", body, options);
  }

  get(clusterId: string, options?: RequestOptions): Promise<R<"getKubernetesCluster">> {
    return this._get(path`/kubernetes-clusters/${clusterId}`, undefined, options);
  }

  /** Changes the cluster's size (`PATCH`). */
  update(
    clusterId: string,
    body: B<"scaleKubernetesCluster">,
    options?: RequestOptions,
  ): Promise<R<"scaleKubernetesCluster">> {
    return this._patch(path`/kubernetes-clusters/${clusterId}`, body, options);
  }

  delete(clusterId: string, options?: RequestOptions): Promise<R<"deleteKubernetesCluster">> {
    return this._delete(path`/kubernetes-clusters/${clusterId}`, options);
  }

  /** Upgrades the cluster to a newer Kubernetes version. */
  upgrade(
    clusterId: string,
    body: B<"upgradeKubernetesCluster">,
    options?: RequestOptions,
  ): Promise<R<"upgradeKubernetesCluster">> {
    return this._post(path`/kubernetes-clusters/${clusterId}/upgrade`, body, options);
  }

  /** Moves every node to another plan. */
  resizePlan(
    clusterId: string,
    body: B<"resizeKubernetesClusterPlan">,
    options?: RequestOptions,
  ): Promise<R<"resizeKubernetesClusterPlan">> {
    return this._post(path`/kubernetes-clusters/${clusterId}/resize-plan`, body, options);
  }

  /** Changes the cluster's networking. */
  upgradeNetwork(
    clusterId: string,
    body: B<"upgradeKubernetesClusterNetwork">,
    options?: RequestOptions,
  ): Promise<R<"upgradeKubernetesClusterNetwork">> {
    return this._post(path`/kubernetes-clusters/${clusterId}/upgrade-network`, body, options);
  }

  start(clusterId: string, options?: RequestOptions): Promise<R<"startKubernetesCluster">> {
    return this._post(path`/kubernetes-clusters/${clusterId}/start`, undefined, options);
  }

  stop(clusterId: string, options?: RequestOptions): Promise<R<"stopKubernetesCluster">> {
    return this._post(path`/kubernetes-clusters/${clusterId}/stop`, undefined, options);
  }

  /** The cluster's kubeconfig. It holds credentials: store it securely. */
  getKubeconfig(clusterId: string, options?: RequestOptions): Promise<R<"getKubernetesKubeconfig">> {
    return this._post(path`/kubernetes-clusters/${clusterId}/kubeconfig`, undefined, options);
  }

  listNodes(clusterId: string, options?: RequestOptions): Promise<R<"listKubernetesClusterNodes">> {
    return this._get(path`/kubernetes-clusters/${clusterId}/nodes`, undefined, options);
  }

  getWorkloads(clusterId: string, options?: RequestOptions): Promise<R<"getKubernetesWorkloads">> {
    return this._get(path`/kubernetes-clusters/${clusterId}/workloads`, undefined, options);
  }

  applyManifest(
    clusterId: string,
    body: B<"applyKubernetesManifest">,
    options?: RequestOptions,
  ): Promise<R<"applyKubernetesManifest">> {
    return this._post(path`/kubernetes-clusters/${clusterId}/apply-manifest`, body, options);
  }

  getLiveManifests(clusterId: string, options?: RequestOptions): Promise<R<"getKubernetesLiveManifests">> {
    return this._get(path`/kubernetes-clusters/${clusterId}/live-manifests`, undefined, options);
  }

  exposeService(
    clusterId: string,
    body: B<"exposeKubernetesService">,
    options?: RequestOptions,
  ): Promise<R<"exposeKubernetesService">> {
    return this._post(path`/kubernetes-clusters/${clusterId}/expose-service`, body, options);
  }

  syncRouting(clusterId: string, options?: RequestOptions): Promise<R<"syncKubernetesRouting">> {
    return this._post(path`/kubernetes-clusters/${clusterId}/sync-routing`, undefined, options);
  }

  /** Sets whether the cluster's API endpoint is private, public or both. */
  configureEndpointAccess(
    clusterId: string,
    body: B<"configureKubernetesEndpointAccess">,
    options?: RequestOptions,
  ): Promise<R<"configureKubernetesEndpointAccess">> {
    return this._post(path`/kubernetes-clusters/${clusterId}/endpoint-access`, body, options);
  }
}

export class KubernetesNodePools extends APIResource {
  list(
    clusterId: string,
    params: L<"listKubernetesNodePools"> = {},
    options?: RequestOptions,
  ): Promise<R<"listKubernetesNodePools">> {
    return this._get(path`/kubernetes-clusters/${clusterId}/node-pools`, params, options);
  }

  listAll(
    clusterId: string,
    params: LA<"listKubernetesNodePools"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listKubernetesNodePools">> {
    return this._listAll(path`/kubernetes-clusters/${clusterId}/node-pools`, params, options);
  }

  create(
    clusterId: string,
    body: B<"createKubernetesNodePool">,
    options?: RequestOptions,
  ): Promise<R<"createKubernetesNodePool">> {
    return this._post(path`/kubernetes-clusters/${clusterId}/node-pools`, body, options);
  }

  /** Sets the pool's whole size: a missing `autoscaling_enabled` turns autoscaling off. */
  scale(
    clusterId: string,
    poolId: string,
    body: B<"scaleKubernetesNodePool">,
    options?: RequestOptions,
  ): Promise<R<"scaleKubernetesNodePool">> {
    return this._patch(path`/kubernetes-clusters/${clusterId}/node-pools/${poolId}`, body, options);
  }

  delete(clusterId: string, poolId: string, options?: RequestOptions): Promise<R<"deleteKubernetesNodePool">> {
    return this._delete(path`/kubernetes-clusters/${clusterId}/node-pools/${poolId}`, options);
  }
}

export class KubernetesAddons extends APIResource {
  list(
    clusterId: string,
    params: L<"listKubernetesAddons"> = {},
    options?: RequestOptions,
  ): Promise<R<"listKubernetesAddons">> {
    return this._get(path`/kubernetes-clusters/${clusterId}/addons`, params, options);
  }

  listAll(
    clusterId: string,
    params: LA<"listKubernetesAddons"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listKubernetesAddons">> {
    return this._listAll(path`/kubernetes-clusters/${clusterId}/addons`, params, options);
  }

  /** Turns an add-on on or off. */
  toggle(
    clusterId: string,
    addonName: string,
    body: B<"toggleKubernetesAddon">,
    options?: RequestOptions,
  ): Promise<R<"toggleKubernetesAddon">> {
    return this._post(path`/kubernetes-clusters/${clusterId}/addons/${addonName}/toggle`, body, options);
  }
}
