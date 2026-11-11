import type { RequestOptions } from "../client.js";
import { CertificateFailedError } from "../errors.js";
import type { Certificate } from "../models.js";
import { APIResource, hideSecrets } from "../resource.js";
import type { BodyOf as B, ItemOf as I, ListParams as L, ListAllParams as LA, ResponseOf as R } from "../types.js";
import { path } from "../util.js";
import { poll, type WaitOptions } from "../wait.js";

const ISSUE_WAIT_MS = 10 * 60_000;
const READY = new Set(["issued", "renewing"]);
const FINISHED = new Set(["failed", "revoked", "expired"]);

/**
 * Certificate Manager: TLS certificates Pantech issues through a publicly
 * trusted CA and renews by itself, or ones you import, for Pantech load
 * balancers and your own servers. Key material is never logged: an exported
 * `private_key_pem` is non-enumerable, and request bodies are never logged.
 */
export class Certificates extends APIResource {
  /** One page of your certificates, newest first. Filter with `q` (any name), `status` or `kind`. */
  list(params: L<"listCertificates"> = {}, options?: RequestOptions): Promise<R<"listCertificates">> {
    return this._get("/certificates", params, options);
  }

  listAll(params: LA<"listCertificates"> = {}, options?: RequestOptions): AsyncGenerator<I<"listCertificates">> {
    return this._listAll("/certificates", params, options);
  }

  /**
   * Requests a certificate for 1 to 100 names. Names in your Pantech DNS
   * zones are validated for you; for the others add each `validations[]`
   * CNAME once. Follow it with `wait`.
   */
  request(body: B<"requestCertificate">, options?: RequestOptions): Promise<R<"requestCertificate">> {
    return this._post("/certificates", body, options);
  }

  /** Imports a certificate and its private key. An expired or mismatched one is refused. */
  import(body: B<"importCertificate">, options?: RequestOptions): Promise<R<"importCertificate">> {
    return this._post("/certificates/import", body, options);
  }

  get(certificateId: string, options?: RequestOptions): Promise<R<"getCertificate">> {
    return this._get(path`/certificates/${certificateId}`, undefined, options);
  }

  update(
    certificateId: string,
    body: B<"updateCertificate">,
    options?: RequestOptions,
  ): Promise<R<"updateCertificate">> {
    return this._patch(path`/certificates/${certificateId}`, body, options);
  }

  /** Checks the CNAMEs of a certificate waiting for validation within seconds. */
  verify(certificateId: string, options?: RequestOptions): Promise<R<"verifyCertificate">> {
    return this._post(path`/certificates/${certificateId}/verify`, undefined, options);
  }

  /** Replaces an imported certificate with a new one for the same names. */
  reimport(
    certificateId: string,
    body: B<"reimportCertificate">,
    options?: RequestOptions,
  ): Promise<R<"reimportCertificate">> {
    return this._post(path`/certificates/${certificateId}/reimport`, body, options);
  }

  /**
   * The certificate, its chain and its private key, for a certificate created
   * with `exportable: true`. Needs the `delete` scope; every owner and admin is
   * emailed. `private_key_pem` is non-enumerable: read it explicitly.
   */
  async export(certificateId: string, options?: RequestOptions): Promise<R<"exportCertificate">> {
    return hideSecrets(
      await this._post<R<"exportCertificate">>(path`/certificates/${certificateId}/export`, undefined, options),
    );
  }

  /** Asks the CA to revoke it (`reason`: `unspecified` or `key_compromise`). Refused while it is in use. */
  revoke(
    certificateId: string,
    body: B<"revokeCertificate"> = {},
    options?: RequestOptions,
  ): Promise<R<"revokeCertificate">> {
    return this._post(path`/certificates/${certificateId}/revoke`, body, options);
  }

  /** Deletes it. Refused while a Pantech service uses it. */
  delete(certificateId: string, options?: RequestOptions): Promise<void> {
    return this._delete(path`/certificates/${certificateId}`, options);
  }

  /**
   * Polls the certificate until it is `issued` (resolves with it) or it
   * `failed`, was revoked or expired (rejects with CertificateFailedError).
   * Default timeout 10 minutes, polling every 5 seconds; a name validated by
   * CNAME waits until you add it, up to 72 hours, so pass a longer `timeoutMs`.
   */
  wait(certificateId: string, options: WaitOptions<Certificate> = {}): Promise<Certificate> {
    return poll(
      () => this.get(certificateId, { signal: options.signal }),
      (c) => {
        if (FINISHED.has(c.status)) {
          const code = c.failure_code ?? c.status;
          const detail = code === c.status ? "" : ` (${code})`;
          throw new CertificateFailedError(`Certificate ${c.id} (${c.names[0] ?? ""}) is ${c.status}${detail}.`, c, {
            code,
          });
        }
        return READY.has(c.status);
      },
      `Certificate ${certificateId}`,
      { timeoutMs: ISSUE_WAIT_MS, pollIntervalMs: 5_000, ...options },
    );
  }
}
