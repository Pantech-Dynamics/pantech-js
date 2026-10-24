import type { RequestOptions } from "../client.js";
import { APIResource } from "../resource.js";
import type { BodyOf as B, ItemOf as I, ListParams as L, ListAllParams as LA, ResponseOf as R } from "../types.js";
import { path } from "../util.js";

/** VPC networks. */
export class Networks extends APIResource {
  /** A network's subnets: `client.networks.subnets.list(networkId)`. */
  readonly subnets: Subnets = new Subnets(this._client);
  /** A subnet's firewall rules: `client.networks.firewallRules.list(subnetId)`. */
  readonly firewallRules: FirewallRules = new FirewallRules(this._client);

  list(params: L<"listNetworks"> = {}, options?: RequestOptions): Promise<R<"listNetworks">> {
    return this._get("/networks", params, options);
  }

  listAll(params: LA<"listNetworks"> = {}, options?: RequestOptions): AsyncGenerator<I<"listNetworks">> {
    return this._listAll("/networks", params, options);
  }

  create(body: B<"createNetwork">, options?: RequestOptions): Promise<R<"createNetwork">> {
    return this._post("/networks", body, options);
  }

  /** What a network costs a month. */
  quote(options?: RequestOptions): Promise<R<"quoteNetwork">> {
    return this._get("/networks/quote", undefined, options);
  }

  get(networkId: string, options?: RequestOptions): Promise<R<"getNetwork">> {
    return this._get(path`/networks/${networkId}`, undefined, options);
  }

  delete(networkId: string, options?: RequestOptions): Promise<R<"deleteNetwork">> {
    return this._delete(path`/networks/${networkId}`, options);
  }
}

export class Subnets extends APIResource {
  /** One page of a network's subnets. */
  list(networkId: string, params: L<"listSubnets"> = {}, options?: RequestOptions): Promise<R<"listSubnets">> {
    return this._get(path`/networks/${networkId}/subnets`, params, options);
  }

  listAll(
    networkId: string,
    params: LA<"listSubnets"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listSubnets">> {
    return this._listAll(path`/networks/${networkId}/subnets`, params, options);
  }

  create(networkId: string, body: B<"createSubnet">, options?: RequestOptions): Promise<R<"createSubnet">> {
    return this._post(path`/networks/${networkId}/subnets`, body, options);
  }

  get(subnetId: string, options?: RequestOptions): Promise<R<"getSubnet">> {
    return this._get(path`/subnets/${subnetId}`, undefined, options);
  }

  delete(subnetId: string, options?: RequestOptions): Promise<R<"deleteSubnet">> {
    return this._delete(path`/subnets/${subnetId}`, options);
  }
}

export class FirewallRules extends APIResource {
  /** A subnet's rules, plus the `system_rules` every subnet has. */
  list(
    subnetId: string,
    params: L<"listFirewallRules"> = {},
    options?: RequestOptions,
  ): Promise<R<"listFirewallRules">> {
    return this._get(path`/subnets/${subnetId}/firewall-rules`, params, options);
  }

  listAll(
    subnetId: string,
    params: LA<"listFirewallRules"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listFirewallRules">> {
    return this._listAll(path`/subnets/${subnetId}/firewall-rules`, params, options);
  }

  create(subnetId: string, body: B<"createFirewallRule">, options?: RequestOptions): Promise<R<"createFirewallRule">> {
    return this._post(path`/subnets/${subnetId}/firewall-rules`, body, options);
  }

  get(subnetId: string, ruleId: string, options?: RequestOptions): Promise<R<"getFirewallRule">> {
    return this._get(path`/subnets/${subnetId}/firewall-rules/${ruleId}`, undefined, options);
  }

  delete(ruleId: string, options?: RequestOptions): Promise<R<"deleteFirewallRule">> {
    return this._delete(path`/firewall-rules/${ruleId}`, options);
  }
}
