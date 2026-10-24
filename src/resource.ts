import type { APIRequest, HTTPMethod, Pantech, RequestOptions } from "./client.js";
import { type Page, paginate } from "./pagination.js";

type Extra = Pick<APIRequest, "noRetry" | "responseType">;

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
