import type { RequestOptions } from "../client.js";
import { APIResource } from "../resource.js";
import type { BodyOf as B, ItemOf as I, ListParams as L, ListAllParams as LA, ResponseOf as R } from "../types.js";
import { path } from "../util.js";

/** Reusable firewalls for standard instances. */
export class SecurityGroups extends APIResource {
  list(params: L<"listSecurityGroups"> = {}, options?: RequestOptions): Promise<R<"listSecurityGroups">> {
    return this._get("/security-groups", params, options);
  }

  listAll(params: LA<"listSecurityGroups"> = {}, options?: RequestOptions): AsyncGenerator<I<"listSecurityGroups">> {
    return this._listAll("/security-groups", params, options);
  }

  create(body: B<"createSecurityGroup">, options?: RequestOptions): Promise<R<"createSecurityGroup">> {
    return this._post("/security-groups", body, options);
  }

  get(securityGroupId: string, options?: RequestOptions): Promise<R<"getSecurityGroup">> {
    return this._get(path`/security-groups/${securityGroupId}`, undefined, options);
  }

  delete(securityGroupId: string, options?: RequestOptions): Promise<R<"deleteSecurityGroup">> {
    return this._delete(path`/security-groups/${securityGroupId}`, options);
  }

  /** Replaces every rule of the group. */
  replaceRules(
    securityGroupId: string,
    body: B<"replaceSecurityGroupRules">,
    options?: RequestOptions,
  ): Promise<R<"replaceSecurityGroupRules">> {
    return this._put(path`/security-groups/${securityGroupId}/rules`, body, options);
  }
}
