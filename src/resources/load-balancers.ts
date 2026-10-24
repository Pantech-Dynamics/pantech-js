import type { RequestOptions } from "../client.js";
import { APIResource } from "../resource.js";
import type { BodyOf as B, ItemOf as I, ListParams as L, ListAllParams as LA, ResponseOf as R } from "../types.js";
import { path } from "../util.js";

/** Spread traffic on one public port across several instances in a private network. */
export class LoadBalancers extends APIResource {
  list(params: L<"listLoadBalancers"> = {}, options?: RequestOptions): Promise<R<"listLoadBalancers">> {
    return this._get("/load-balancers", params, options);
  }

  listAll(params: LA<"listLoadBalancers"> = {}, options?: RequestOptions): AsyncGenerator<I<"listLoadBalancers">> {
    return this._listAll("/load-balancers", params, options);
  }

  create(body: B<"createLoadBalancer">, options?: RequestOptions): Promise<R<"createLoadBalancer">> {
    return this._post("/load-balancers", body, options);
  }

  get(loadBalancerId: string, options?: RequestOptions): Promise<R<"getLoadBalancer">> {
    return this._get(path`/load-balancers/${loadBalancerId}`, undefined, options);
  }

  update(
    loadBalancerId: string,
    body: B<"updateLoadBalancer">,
    options?: RequestOptions,
  ): Promise<R<"updateLoadBalancer">> {
    return this._patch(path`/load-balancers/${loadBalancerId}`, body, options);
  }

  delete(loadBalancerId: string, options?: RequestOptions): Promise<R<"deleteLoadBalancer">> {
    return this._delete(path`/load-balancers/${loadBalancerId}`, options);
  }
}
