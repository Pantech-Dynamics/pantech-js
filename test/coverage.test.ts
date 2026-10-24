// Every operation in the public API spec must have an SDK method. The table
// maps each operationId to a call; the test runs it against a fake fetch and
// checks it reaches the spec's method and path.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { Pantech } from "../src/index.ts";
import { json, mockClient } from "./helpers.ts";

type Call = (c: Pantech) => unknown;
const X = "x_1";
const Y = "y_2";
const B = {} as never;

const table: Record<string, Call> = {
  // Account
  getMe: (c) => c.me.get(),
  // Billing
  getCredit: (c) => c.billing.credit.get(),
  createCreditPurchase: (c) => c.billing.credit.purchases.create(B),
  getCreditPurchase: (c) => c.billing.credit.purchases.get(X),
  listReceipts: (c) => c.billing.receipts.list(),
  getReceipt: (c) => c.billing.receipts.get(X),
  getReceiptPdf: (c) => c.billing.receipts.getPdf(X),
  // Catalogue
  listRegions: (c) => c.regions.list(),
  listPlans: (c) => c.plans.list(),
  listImages: (c) => c.images.list(),
  listDiskOfferings: (c) => c.diskOfferings.list(),
  quoteDiskOffering: (c) => c.diskOfferings.quote(X),
  listDatabaseEngines: (c) => c.databaseEngines.list(),
  listKubernetesVersions: (c) => c.kubernetesVersions.list(),
  estimatePricing: (c) => c.pricing.estimate(B),
  // Usage
  getUsage: (c) => c.usage.get(),
  getUsageByResource: (c) => c.usage.byResource(),
  // Instances
  listInstances: (c) => c.instances.list(),
  createInstance: (c) => c.instances.create(B),
  getInstance: (c) => c.instances.get(X),
  deleteInstance: (c) => c.instances.delete(X),
  openInstanceConsole: (c) => c.instances.openConsole(X),
  issueVolumeKeyCredential: (c) => c.instances.issueVolumeKeyCredential(X),
  getInstanceMetrics: (c) => c.instances.metrics(X),
  rebootInstance: (c) => c.instances.reboot(X),
  rebuildInstance: (c) => c.instances.rebuild(X, B),
  renameInstance: (c) => c.instances.rename(X, B),
  resizeInstance: (c) => c.instances.resize(X, B),
  changeInstanceSSHKey: (c) => c.instances.changeSshKey(X, B),
  restoreInstance: (c) => c.instances.restore(X, B),
  changeInstanceSecurityGroup: (c) => c.instances.changeSecurityGroup(X, B),
  attachInstancePrivateNetwork: (c) => c.instances.attachPrivateNetwork(X),
  detachInstancePrivateNetwork: (c) => c.instances.detachPrivateNetwork(X),
  getInstanceSnapshotSchedule: (c) => c.instances.getSnapshotSchedule(X),
  putInstanceSnapshotSchedule: (c) => c.instances.setSnapshotSchedule(X, B),
  listInstanceSnapshots: (c) => c.instances.snapshots.list(X),
  createInstanceSnapshot: (c) => c.instances.snapshots.create(X, B),
  openSSHAccess: (c) => c.instances.sshAccess.open(X),
  getSSHAccess: (c) => c.instances.sshAccess.get(X, Y),
  revokeSSHAccess: (c) => c.instances.sshAccess.revoke(X, Y),
  startInstance: (c) => c.instances.start(X),
  stopInstance: (c) => c.instances.stop(X),
  getInstanceUsage: (c) => c.instances.usage(X),
  listInstanceVolumes: (c) => c.instances.listVolumes(X),
  // Instance orders
  listInstanceOrders: (c) => c.instanceOrders.list(),
  getInstanceOrder: (c) => c.instanceOrders.get(X),
  // Networks
  listNetworks: (c) => c.networks.list(),
  createNetwork: (c) => c.networks.create(B),
  quoteNetwork: (c) => c.networks.quote(),
  getNetwork: (c) => c.networks.get(X),
  deleteNetwork: (c) => c.networks.delete(X),
  listSubnets: (c) => c.networks.subnets.list(X),
  createSubnet: (c) => c.networks.subnets.create(X, B),
  getSubnet: (c) => c.networks.subnets.get(X),
  deleteSubnet: (c) => c.networks.subnets.delete(X),
  listFirewallRules: (c) => c.networks.firewallRules.list(X),
  createFirewallRule: (c) => c.networks.firewallRules.create(X, B),
  getFirewallRule: (c) => c.networks.firewallRules.get(X, Y),
  deleteFirewallRule: (c) => c.networks.firewallRules.delete(X),
  // Public IPs
  listPublicIPs: (c) => c.publicIps.list(),
  createPublicIP: (c) => c.publicIps.create(B),
  quotePublicIP: (c) => c.publicIps.quote(),
  getPublicIP: (c) => c.publicIps.get(X),
  deletePublicIP: (c) => c.publicIps.delete(X),
  attachPublicIP: (c) => c.publicIps.attach(X, B),
  detachPublicIP: (c) => c.publicIps.detach(X),
  listPortForwardingRules: (c) => c.publicIps.portForwardingRules.list(X),
  createPortForwardingRule: (c) => c.publicIps.portForwardingRules.create(X, B),
  getPortForwardingRule: (c) => c.publicIps.portForwardingRules.get(X, Y),
  deletePortForwardingRule: (c) => c.publicIps.portForwardingRules.delete(X),
  // Load balancers
  listLoadBalancers: (c) => c.loadBalancers.list(),
  createLoadBalancer: (c) => c.loadBalancers.create(B),
  getLoadBalancer: (c) => c.loadBalancers.get(X),
  updateLoadBalancer: (c) => c.loadBalancers.update(X, B),
  deleteLoadBalancer: (c) => c.loadBalancers.delete(X),
  // Kubernetes
  listKubernetesClusters: (c) => c.kubernetes.list(),
  createKubernetesCluster: (c) => c.kubernetes.create(B),
  getKubernetesCluster: (c) => c.kubernetes.get(X),
  scaleKubernetesCluster: (c) => c.kubernetes.update(X, B),
  deleteKubernetesCluster: (c) => c.kubernetes.delete(X),
  upgradeKubernetesCluster: (c) => c.kubernetes.upgrade(X, B),
  resizeKubernetesClusterPlan: (c) => c.kubernetes.resizePlan(X, B),
  upgradeKubernetesClusterNetwork: (c) => c.kubernetes.upgradeNetwork(X, B),
  startKubernetesCluster: (c) => c.kubernetes.start(X),
  stopKubernetesCluster: (c) => c.kubernetes.stop(X),
  getKubernetesKubeconfig: (c) => c.kubernetes.getKubeconfig(X),
  listKubernetesClusterNodes: (c) => c.kubernetes.listNodes(X),
  getKubernetesWorkloads: (c) => c.kubernetes.getWorkloads(X),
  applyKubernetesManifest: (c) => c.kubernetes.applyManifest(X, B),
  getKubernetesLiveManifests: (c) => c.kubernetes.getLiveManifests(X),
  exposeKubernetesService: (c) => c.kubernetes.exposeService(X, B),
  syncKubernetesRouting: (c) => c.kubernetes.syncRouting(X),
  configureKubernetesEndpointAccess: (c) => c.kubernetes.configureEndpointAccess(X, B),
  listKubernetesNodePools: (c) => c.kubernetes.nodePools.list(X),
  createKubernetesNodePool: (c) => c.kubernetes.nodePools.create(X, B),
  scaleKubernetesNodePool: (c) => c.kubernetes.nodePools.scale(X, Y, B),
  deleteKubernetesNodePool: (c) => c.kubernetes.nodePools.delete(X, Y),
  listKubernetesAddons: (c) => c.kubernetes.addons.list(X),
  toggleKubernetesAddon: (c) => c.kubernetes.addons.toggle(X, Y, B),
  // Security groups
  listSecurityGroups: (c) => c.securityGroups.list(),
  createSecurityGroup: (c) => c.securityGroups.create(B),
  getSecurityGroup: (c) => c.securityGroups.get(X),
  deleteSecurityGroup: (c) => c.securityGroups.delete(X),
  replaceSecurityGroupRules: (c) => c.securityGroups.replaceRules(X, B),
  // Volumes
  listVolumes: (c) => c.volumes.list(),
  createVolume: (c) => c.volumes.create(B),
  getVolume: (c) => c.volumes.get(X),
  deleteVolume: (c) => c.volumes.delete(X),
  attachVolume: (c) => c.volumes.attach(X, B),
  detachVolume: (c) => c.volumes.detach(X),
  resizeVolume: (c) => c.volumes.resize(X, B),
  getVolumeSnapshotSchedule: (c) => c.volumes.getSnapshotSchedule(X),
  putVolumeSnapshotSchedule: (c) => c.volumes.setSnapshotSchedule(X, B),
  listVolumeSnapshots: (c) => c.volumes.snapshots.list(X),
  createVolumeSnapshot: (c) => c.volumes.snapshots.create(X, B),
  getVolumeUsage: (c) => c.volumes.usage(X),
  // Snapshots
  listSnapshots: (c) => c.snapshots.list(),
  quoteSnapshot: (c) => c.snapshots.quote({ size_gb: 10 }),
  getSnapshot: (c) => c.snapshots.get(X),
  deleteSnapshot: (c) => c.snapshots.delete(X),
  restoreSnapshot: (c) => c.snapshots.restore(X, B),
  getSnapshotUsage: (c) => c.snapshots.usage(X),
  // Databases
  listDatabases: (c) => c.databases.list(),
  createDatabase: (c) => c.databases.create(B),
  getDatabase: (c) => c.databases.get(X),
  deleteDatabase: (c) => c.databases.delete(X),
  replaceDatabaseAccessRules: (c) => c.databases.replaceAccessRules(X, B),
  setDatabaseSecurityGroups: (c) => c.databases.setSecurityGroups(X, B),
  changeDatabasePassword: (c) => c.databases.changePassword(X, B),
  resetDatabasePassword: (c) => c.databases.resetPassword(X),
  startDatabase: (c) => c.databases.start(X),
  stopDatabase: (c) => c.databases.stop(X),
  resizeDatabaseStorage: (c) => c.databases.resizeStorage(X, B),
  listDatabaseSnapshots: (c) => c.databases.snapshots.list(X),
  createDatabaseSnapshot: (c) => c.databases.snapshots.create(X, B),
  getDatabaseSnapshot: (c) => c.databases.snapshots.get(X, Y),
  deleteDatabaseSnapshot: (c) => c.databases.snapshots.delete(X, Y),
  listDatabaseOrders: (c) => c.databaseOrders.list(),
  getDatabaseOrder: (c) => c.databaseOrders.get(X),
  // SSH keys
  listSSHKeys: (c) => c.sshKeys.list(),
  createSSHKey: (c) => c.sshKeys.create(B),
  getSSHKey: (c) => c.sshKeys.get(X),
  deleteSSHKey: (c) => c.sshKeys.delete(X),
  // Webhooks
  listWebhookEventTypes: (c) => c.webhooks.listEventTypes(),
  listWebhooks: (c) => c.webhooks.list(),
  createWebhook: (c) => c.webhooks.create(B),
  getWebhook: (c) => c.webhooks.get(X),
  updateWebhook: (c) => c.webhooks.update(X, B),
  deleteWebhook: (c) => c.webhooks.delete(X),
  testWebhook: (c) => c.webhooks.test(X),
  rotateWebhookSecret: (c) => c.webhooks.rotateSecret(X),
  listWebhookDeliveries: (c) => c.webhooks.deliveries.list(X),
  getWebhookDelivery: (c) => c.webhooks.deliveries.get(X, Y),
  redeliverWebhook: (c) => c.webhooks.deliveries.redeliver(X, Y),
  // Operations
  getOperation: (c) => c.operations.get(X),
  streamOperation: (c) => c.operations.stream(X).next(),
};

/**
 * Routes the SDK covers that the vendored spec may not list yet, keyed by
 * "METHOD /path". They match a spec operation by route, whatever its
 * operationId turns out to be.
 */
const byRoute: Record<string, Call> = {
  "DELETE /me": (c) => c.me.revoke(),
};

interface SpecOperation {
  operationId: string;
  method: string;
  path: string;
}

function specOperations(): SpecOperation[] {
  const doc = parse(readFileSync(new URL("../spec/public-api.yaml", import.meta.url), "utf8"));
  const out: SpecOperation[] = [];
  for (const [path, item] of Object.entries<Record<string, { operationId?: string }>>(doc.paths)) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const op = item[method];
      if (op)
        out.push({
          operationId: op.operationId ?? "",
          method: method.toUpperCase(),
          path: path.replace(/^\/public\/v1/, ""),
        });
    }
  }
  return out;
}

/** The spec path with each `{param}` filled in the order the table's calls use: x_1, then y_2. */
function expectedPath(template: string): string {
  let n = 0;
  return `/public/v1${template.replace(/\{[^}]+\}/g, () => (n++ === 0 ? X : Y))}`;
}

const sse = 'event: operation\ndata: {"id":"x_1","status":"succeeded"}\n\n';

describe("spec coverage", () => {
  const ops = specOperations();

  it("reads the spec", () => {
    expect(ops.length).toBeGreaterThan(150);
  });

  it("maps every spec operation to an SDK method", () => {
    const missing = ops.filter((op) => !table[op.operationId] && !byRoute[`${op.method} ${op.path}`]);
    expect(missing.map((op) => `${op.operationId} (${op.method} ${op.path})`)).toEqual([]);
  });

  it("has no table entry for an operation the spec does not have", () => {
    const ids = new Set(ops.map((op) => op.operationId));
    expect(Object.keys(table).filter((id) => !ids.has(id))).toEqual([]);
  });

  for (const op of ops) {
    const call = table[op.operationId] ?? byRoute[`${op.method} ${op.path}`];
    if (!call) continue;
    it(`${op.operationId}: ${op.method} ${op.path}`, async () => {
      const { client, calls } = mockClient((c) =>
        c.url.pathname.endsWith("/events")
          ? new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } })
          : json(200, { data: [], next_cursor: null }),
      );
      await call(client);
      expect(calls).toHaveLength(1);
      expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe(`${op.method} ${expectedPath(op.path)}`);
      const write = op.method !== "GET";
      expect(calls[0]?.headers.has("idempotency-key")).toBe(write);
    });
  }

  for (const [route, call] of Object.entries(byRoute)) {
    it(`${route} (added to the API; may precede the vendored spec)`, async () => {
      const { client, calls } = mockClient(() => new Response(null, { status: 204 }));
      await call(client);
      const [method, path] = route.split(" ");
      expect(`${calls[0]?.method} ${calls[0]?.url.pathname}`).toBe(`${method} /public/v1${path}`);
    });
  }
});
