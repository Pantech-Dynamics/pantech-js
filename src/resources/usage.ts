import type { RequestOptions } from "../client.js";
import { APIResource } from "../resource.js";
import type { QueryOf as Q, ResponseOf as R } from "../types.js";

/** What has been used, and what it cost. */
export class Usage extends APIResource {
  /** The organization's usage this period. */
  get(options?: RequestOptions): Promise<R<"getUsage">> {
    return this._get("/usage", undefined, options);
  }

  /** Usage broken down per resource. */
  byResource(params: Q<"getUsageByResource"> = {}, options?: RequestOptions): Promise<R<"getUsageByResource">> {
    return this._get("/usage/by-resource", params, options);
  }
}
