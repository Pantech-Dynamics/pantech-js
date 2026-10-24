import type { RequestOptions } from "../client.js";
import { APIResource } from "../resource.js";
import type { BodyOf as B, ItemOf as I, ListParams as L, ListAllParams as LA, ResponseOf as R } from "../types.js";
import { path } from "../util.js";

/** Public addresses for VPC instances. */
export class PublicIps extends APIResource {
  /** An address's port forwarding rules. */
  readonly portForwardingRules: PortForwardingRules = new PortForwardingRules(this._client);

  list(params: L<"listPublicIPs"> = {}, options?: RequestOptions): Promise<R<"listPublicIPs">> {
    return this._get("/public-ips", params, options);
  }

  listAll(params: LA<"listPublicIPs"> = {}, options?: RequestOptions): AsyncGenerator<I<"listPublicIPs">> {
    return this._listAll("/public-ips", params, options);
  }

  create(body: B<"createPublicIP">, options?: RequestOptions): Promise<R<"createPublicIP">> {
    return this._post("/public-ips", body, options);
  }

  /** What a public IP costs a month. */
  quote(options?: RequestOptions): Promise<R<"quotePublicIP">> {
    return this._get("/public-ips/quote", undefined, options);
  }

  get(publicIpId: string, options?: RequestOptions): Promise<R<"getPublicIP">> {
    return this._get(path`/public-ips/${publicIpId}`, undefined, options);
  }

  delete(publicIpId: string, options?: RequestOptions): Promise<R<"deletePublicIP">> {
    return this._delete(path`/public-ips/${publicIpId}`, options);
  }

  attach(publicIpId: string, body: B<"attachPublicIP">, options?: RequestOptions): Promise<R<"attachPublicIP">> {
    return this._post(path`/public-ips/${publicIpId}/attach`, body, options);
  }

  detach(publicIpId: string, options?: RequestOptions): Promise<R<"detachPublicIP">> {
    return this._post(path`/public-ips/${publicIpId}/detach`, undefined, options);
  }
}

export class PortForwardingRules extends APIResource {
  list(
    publicIpId: string,
    params: L<"listPortForwardingRules"> = {},
    options?: RequestOptions,
  ): Promise<R<"listPortForwardingRules">> {
    return this._get(path`/public-ips/${publicIpId}/port-forwarding-rules`, params, options);
  }

  listAll(
    publicIpId: string,
    params: LA<"listPortForwardingRules"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listPortForwardingRules">> {
    return this._listAll(path`/public-ips/${publicIpId}/port-forwarding-rules`, params, options);
  }

  create(
    publicIpId: string,
    body: B<"createPortForwardingRule">,
    options?: RequestOptions,
  ): Promise<R<"createPortForwardingRule">> {
    return this._post(path`/public-ips/${publicIpId}/port-forwarding-rules`, body, options);
  }

  get(publicIpId: string, ruleId: string, options?: RequestOptions): Promise<R<"getPortForwardingRule">> {
    return this._get(path`/public-ips/${publicIpId}/port-forwarding-rules/${ruleId}`, undefined, options);
  }

  delete(ruleId: string, options?: RequestOptions): Promise<R<"deletePortForwardingRule">> {
    return this._delete(path`/port-forwarding-rules/${ruleId}`, options);
  }
}
