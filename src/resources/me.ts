import type { RequestOptions } from "../client.js";
import type { Me } from "../models.js";
import { APIResource } from "../resource.js";

export class MeResource extends APIResource {
  /** The organization and project the key acts in, its scopes, kind and expiry. */
  get(options?: RequestOptions): Promise<Me> {
    return this._get("/me", undefined, options);
  }

  /**
   * Revokes the API key making the call. Every later call with it is a
   * `401`. Sent once: a retry would find the key gone.
   */
  revoke(options?: RequestOptions): Promise<void> {
    return this._delete("/me", options, { noRetry: true });
  }
}
