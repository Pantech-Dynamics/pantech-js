// The client: auth, an Idempotency-Key on every write, timeouts, and retries
// the way the API's conventions ask. Every resource method goes through
// Pantech.request.

import { APIConnectionError, APITimeoutError, errorFromResponse, PantechError } from "./errors.js";
import { Billing } from "./resources/billing.js";
import {
  DatabaseEngines,
  DiskOfferings,
  Images,
  KubernetesVersions,
  Plans,
  Pricing,
  Regions,
} from "./resources/catalog.js";
import { DatabaseOrders, Databases } from "./resources/databases.js";
import { InstanceOrders, Instances } from "./resources/instances.js";
import { Kubernetes } from "./resources/kubernetes.js";
import { LoadBalancers } from "./resources/load-balancers.js";
import { MeResource } from "./resources/me.js";
import { Networks } from "./resources/networks.js";
import { Operations } from "./resources/operations.js";
import { PublicIps } from "./resources/public-ips.js";
import { SecurityGroups } from "./resources/security-groups.js";
import { Snapshots } from "./resources/snapshots.js";
import { SshKeys } from "./resources/ssh-keys.js";
import { Usage } from "./resources/usage.js";
import { Volumes } from "./resources/volumes.js";
import { Webhooks } from "./resources/webhooks.js";
import { readEnv, sleep, uuid } from "./util.js";
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://api.pantechdynamics.com/public/v1";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;
const MAX_RETRY_AFTER_MS = 60_000;

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** A Pantech API key (`PAN_…`). Defaults to the `PANTECH_API_KEY` environment variable. */
  apiKey?: string;
  /**
   * The API's base URL, including `/public/v1`. Defaults to the
   * `PANTECH_API_URL` environment variable, else production.
   */
  baseURL?: string;
  /** How many times a failed request is retried. Default 3. */
  maxRetries?: number;
  /** Milliseconds to wait for each attempt before giving up on it. Default 60000. */
  timeout?: number;
  /** A fetch implementation. Defaults to the global `fetch`. */
  fetch?: Fetch;
  /** Headers sent with every request. */
  defaultHeaders?: Record<string, string>;
  /** Replaces the `User-Agent` header (`pantech-js/<version>`). Ignored by browsers. */
  userAgent?: string;
}

/** Per-call options, accepted as the last argument of every method. */
export interface RequestOptions {
  /** Cancels the call, including any retries and waits. */
  signal?: AbortSignal;
  /** Overrides the client's per-attempt timeout, in milliseconds. */
  timeout?: number;
  /** Overrides the client's retry count. */
  maxRetries?: number;
  /**
   * The `Idempotency-Key` for a write. One is generated when left out. Reuse
   * a key only to retry the very same change.
   */
  idempotencyKey?: string;
  /** Extra headers for this call. */
  headers?: Record<string, string>;
}

export type HTTPMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** A low-level request, for endpoints you want to call directly. */
export interface APIRequest {
  method: HTTPMethod;
  /** Relative to the base URL, e.g. `/instances`. */
  path: string;
  /** Query parameters; undefined and null values are left out, arrays repeat. */
  query?: object;
  /** Sent as JSON. */
  body?: unknown;
  /**
   * Sends a write once. For endpoints the API does not replay by
   * Idempotency-Key, where a retry after a lost answer would act twice. A
   * `429` is still retried: it is refused before anything runs.
   */
  noRetry?: boolean;
  /** How to read a successful response. Default `json`. */
  responseType?: "json" | "arrayBuffer" | "response";
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

/** The Pantech Dynamics public API client. */
export class Pantech {
  readonly baseURL: string;
  readonly maxRetries: number;
  readonly timeout: number;
  // Private fields are invisible to console.log and JSON.stringify, so the
  // key cannot leak through a logged client.
  readonly #apiKey: string;
  readonly #fetch: Fetch;
  readonly #headers: Record<string, string>;

  /** `GET` and `DELETE /me`: the API key making the call. */
  readonly me: MeResource;
  /** Credit, credit purchases and receipts. */
  readonly billing: Billing;
  readonly regions: Regions;
  readonly plans: Plans;
  readonly images: Images;
  readonly diskOfferings: DiskOfferings;
  readonly databaseEngines: DatabaseEngines;
  readonly kubernetesVersions: KubernetesVersions;
  readonly pricing: Pricing;
  readonly usage: Usage;
  readonly instances: Instances;
  readonly instanceOrders: InstanceOrders;
  /** VPC networks, with their subnets and firewall rules. */
  readonly networks: Networks;
  /** Public IPs, with their port forwarding rules. */
  readonly publicIps: PublicIps;
  readonly loadBalancers: LoadBalancers;
  /** Managed Kubernetes clusters, with node pools and add-ons. */
  readonly kubernetes: Kubernetes;
  readonly securityGroups: SecurityGroups;
  readonly volumes: Volumes;
  readonly snapshots: Snapshots;
  readonly databases: Databases;
  readonly databaseOrders: DatabaseOrders;
  readonly sshKeys: SshKeys;
  readonly webhooks: Webhooks;
  readonly operations: Operations;

  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnv("PANTECH_API_KEY");
    if (!apiKey) {
      throw new PantechError(
        "No Pantech API key. Pass `apiKey` or set PANTECH_API_KEY. Create a key in the console under Organization › API keys.",
      );
    }
    this.#apiKey = apiKey;
    this.baseURL = (options.baseURL ?? readEnv("PANTECH_API_URL") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    // Looked up per call, so a fetch replaced after construction is used.
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#headers = {
      ...options.defaultHeaders,
      "User-Agent": options.userAgent ?? `pantech-js/${VERSION}`,
    };

    this.me = new MeResource(this);
    this.billing = new Billing(this);
    this.regions = new Regions(this);
    this.plans = new Plans(this);
    this.images = new Images(this);
    this.diskOfferings = new DiskOfferings(this);
    this.databaseEngines = new DatabaseEngines(this);
    this.kubernetesVersions = new KubernetesVersions(this);
    this.pricing = new Pricing(this);
    this.usage = new Usage(this);
    this.operations = new Operations(this);
    this.instances = new Instances(this);
    this.instanceOrders = new InstanceOrders(this);
    this.networks = new Networks(this);
    this.publicIps = new PublicIps(this);
    this.loadBalancers = new LoadBalancers(this);
    this.kubernetes = new Kubernetes(this);
    this.securityGroups = new SecurityGroups(this);
    this.volumes = new Volumes(this);
    this.snapshots = new Snapshots(this);
    this.databases = new Databases(this);
    this.databaseOrders = new DatabaseOrders(this);
    this.sshKeys = new SshKeys(this);
    this.webhooks = new Webhooks(this);
  }

  /**
   * Sends one request and returns its decoded body (undefined for an empty
   * one). A write carries an Idempotency-Key, reused by every retry, so a
   * change cannot happen twice.
   */
  async request<T = unknown>(req: APIRequest, options: RequestOptions = {}): Promise<T> {
    const url = this.baseURL + req.path + queryString(req.query);
    const isWrite = req.method !== "GET";
    const headers: Record<string, string> = {
      ...this.#headers,
      Accept: req.responseType === "arrayBuffer" ? "*/*" : "application/json",
      ...options.headers,
      Authorization: `Bearer ${this.#apiKey}`,
    };
    let payload: string | undefined;
    if (req.body !== undefined) {
      payload = JSON.stringify(req.body);
      headers["Content-Type"] = "application/json";
    }
    if (isWrite) headers["Idempotency-Key"] = options.idempotencyKey ?? uuid();

    const maxRetries = options.maxRetries ?? this.maxRetries;
    const timeout = options.timeout ?? this.timeout;
    const signal = options.signal;

    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < maxRetries;
      const attemptSignal = linkSignal(signal, timeout);
      let res: Response;
      try {
        res = await this.#fetch(url, { method: req.method, headers, body: payload, signal: attemptSignal.signal });
      } catch (err) {
        attemptSignal.done();
        if (signal?.aborted) throw signal.reason;
        const error = connectionError(err, attemptSignal.timedOut(), isWrite);
        if (canRetry && !req.noRetry) {
          await sleep(backoff(attempt), signal);
          continue;
        }
        throw error;
      }

      if (res.ok) {
        try {
          return (await readBody(res, req.responseType)) as T;
        } catch (err) {
          if (signal?.aborted) throw signal.reason;
          if (err instanceof PantechError) throw err;
          throw connectionError(err, attemptSignal.timedOut(), isWrite);
        } finally {
          if (req.responseType !== "response") attemptSignal.done();
          else attemptSignal.stopTimer();
        }
      }

      let text = "";
      try {
        text = await res.text();
      } catch {
        text = "";
      } finally {
        attemptSignal.done();
      }
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      if (canRetry && RETRY_STATUSES.has(res.status) && (!req.noRetry || res.status === 429)) {
        await sleep(retryAfter !== undefined ? Math.min(retryAfter, MAX_RETRY_AFTER_MS) : backoff(attempt), signal);
        continue;
      }
      throw errorFromResponse(
        res.status,
        res.headers,
        text,
        retryAfter === undefined ? undefined : Math.ceil(retryAfter / 1000),
      );
    }
  }
}

function queryString(query: object | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

async function readBody(res: Response, type: APIRequest["responseType"]): Promise<unknown> {
  if (type === "response") return res;
  if (type === "arrayBuffer") return res.arrayBuffer();
  const text = await res.text();
  if (res.status === 204 || text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new PantechError("The Pantech API sent a response that is not valid JSON.", {
      status: res.status,
      requestId: res.headers.get("x-request-id") ?? undefined,
      headers: res.headers,
      cause,
    });
  }
}

/** 0.5 s, 1 s, 2 s, 4 s… up to 8 s, less up to a quarter at random so clients spread out. */
function backoff(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 8_000);
  return base * (1 - Math.random() * 0.25);
}

/** `Retry-After` in milliseconds: seconds, or an HTTP date. */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function connectionError(cause: unknown, timedOut: boolean, isWrite: boolean): APIConnectionError {
  const maybeApplied = isWrite
    ? " The change may still have gone through: check before trying again, and retry with the same idempotencyKey."
    : " Try again in a moment.";
  if (timedOut) return new APITimeoutError(`The Pantech API did not answer in time.${maybeApplied}`, { cause });
  return new APIConnectionError(
    isWrite
      ? `The connection to the Pantech API failed.${maybeApplied}`
      : "Could not reach the Pantech API. Check the network connection and try again.",
    { cause },
  );
}

/** An AbortSignal that fires on the caller's signal or after `timeout` ms. */
function linkSignal(parent: AbortSignal | undefined, timeout: number) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(parent?.reason);
  if (parent?.aborted) controller.abort(parent.reason);
  else parent?.addEventListener("abort", onAbort, { once: true });
  const timer =
    timeout > 0 && Number.isFinite(timeout)
      ? setTimeout(() => {
          timedOut = true;
          controller.abort(new APITimeoutError("The Pantech API did not answer in time."));
        }, timeout)
      : undefined;
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    /** For a streamed body: the timeout covers the headers only. */
    stopTimer: () => clearTimeout(timer),
    done: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}
