import type { RequestOptions } from "../client.js";
import { APIResource } from "../resource.js";
import type { BodyOf as B, ItemOf as I, ListParams as L, ListAllParams as LA, ResponseOf as R } from "../types.js";
import { path } from "../util.js";

/**
 * Keys installed on new instances. Create and delete are sent once: the API
 * does not replay them by Idempotency-Key, so a retry after a lost answer
 * would act twice (or lose a generated private key).
 */
export class SshKeys extends APIResource {
  list(params: L<"listSSHKeys"> = {}, options?: RequestOptions): Promise<R<"listSSHKeys">> {
    return this._get("/ssh-keys", params, options);
  }

  listAll(params: LA<"listSSHKeys"> = {}, options?: RequestOptions): AsyncGenerator<I<"listSSHKeys">> {
    return this._listAll("/ssh-keys", params, options);
  }

  /**
   * Adds your public key, or generates a key pair and returns the private
   * key in this response only. If the call fails without an answer, list
   * your keys before trying again.
   */
  create(body: B<"createSSHKey">, options?: RequestOptions): Promise<R<"createSSHKey">> {
    return this._post("/ssh-keys", body, options, { noRetry: true });
  }

  get(sshKeyId: string, options?: RequestOptions): Promise<R<"getSSHKey">> {
    return this._get(path`/ssh-keys/${sshKeyId}`, undefined, options);
  }

  /** Deletes the key. A repeat after it is gone is a `404`: treat that as done. */
  delete(sshKeyId: string, options?: RequestOptions): Promise<void> {
    return this._delete(path`/ssh-keys/${sshKeyId}`, options, { noRetry: true });
  }
}
