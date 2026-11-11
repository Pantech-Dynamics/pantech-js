import type { APIRequest, HTTPMethod, Pantech, RequestOptions } from "./client.js";
import { type Page, paginate } from "./pagination.js";

type Extra = Pick<APIRequest, "noRetry" | "responseType">;

/** Options for a change that can be made conditional on the version you read. */
export interface IfMatchOptions extends RequestOptions {
  /**
   * The resource's `version` as you read it, sent as `If-Match`. The change
   * is refused with `412 VERSION_CONFLICT` (PreconditionFailedError) if
   * someone changed it since.
   */
  ifMatch?: number;
}

/** Response fields that are secrets: a registry token's `secret`, an exported `private_key_pem`. */
const SECRET_FIELDS = ["secret", "private_key_pem"] as const;

/**
 * Makes a response's secret fields non-enumerable: `value.secret` still reads
 * one, but console.log, util.inspect, Object.keys and JSON.stringify leave it
 * out, so it is not logged by accident. Copy it to your secret store explicitly.
 */
export function hideSecrets<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const field of SECRET_FIELDS) {
      if (Object.hasOwn(value, field)) {
        const secret = (value as Record<string, unknown>)[field];
        Object.defineProperty(value, field, { value: secret, enumerable: false, writable: false, configurable: true });
      }
    }
  }
  return value;
}

/** Moves `ifMatch` into an `If-Match` header. */
export function withIfMatch(options: IfMatchOptions | undefined): RequestOptions | undefined {
  if (options?.ifMatch === undefined) return options;
  const { ifMatch, ...rest } = options;
  if (!Number.isInteger(ifMatch) || ifMatch < 0) {
    throw new TypeError("ifMatch must be the version you read: a whole number, 0 or more.");
  }
  return { ...rest, headers: { ...rest.headers, "If-Match": String(ifMatch) } };
}

/** The base of every resource: a thin, typed layer over Pantech.request. */
export abstract class APIResource {
  protected readonly _client: Pantech;

  constructor(client: Pantech) {
    this._client = client;
  }

  protected _request<T>(
    method: HTTPMethod,
    path: string,
    init: { query?: object; body?: unknown } & Extra = {},
    options?: RequestOptions,
  ): Promise<T> {
    return this._client.request<T>({ method, path, ...init }, options);
  }

  protected _get<T>(path: string, query?: object, options?: RequestOptions): Promise<T> {
    return this._request<T>("GET", path, { query }, options);
  }

  protected _post<T>(path: string, body?: unknown, options?: RequestOptions, extra?: Extra): Promise<T> {
    return this._request<T>("POST", path, { body, ...extra }, options);
  }

  protected _put<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this._request<T>("PUT", path, { body }, options);
  }

  protected _patch<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this._request<T>("PATCH", path, { body }, options);
  }

  protected _delete<T>(path: string, options?: RequestOptions, extra?: Extra): Promise<T> {
    return this._request<T>("DELETE", path, extra, options);
  }

  /** Every item of a list, following `next_cursor` page by page. */
  protected _listAll<T>(
    path: string,
    params: object | undefined,
    options?: RequestOptions,
  ): AsyncGenerator<T, void, undefined> {
    return paginate<T>((cursor) => this._get<Page<T>>(path, { ...params, cursor }, options));
  }
}
