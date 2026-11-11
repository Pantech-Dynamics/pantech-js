// Errors thrown by the SDK. Every one is a PantechError, so one `instanceof`
// check catches them all; branch on `code`, never on the message.

/** One invalid field of a `422 VALIDATION_FAILED`. */
export interface FieldError {
  /** The request field, e.g. `plan_slug`. */
  field: string;
  /** A stable code for the field's problem, e.g. `REQUIRED`. */
  code: string;
  /** What the field must be. */
  message: string;
}

export interface PantechErrorInit {
  status?: number;
  code?: string;
  title?: string;
  detail?: string;
  requestId?: string;
  errors?: FieldError[];
  type?: string;
  headers?: Headers;
  cause?: unknown;
}

/** The base class of every error the SDK throws. */
export class PantechError extends Error {
  override name = "PantechError";
  /** The HTTP status, when the API answered. */
  readonly status: number | undefined;
  /** The problem's stable code, e.g. `INSUFFICIENT_CREDIT`. */
  readonly code: string | undefined;
  /** A short summary of the problem class. */
  readonly title: string | undefined;
  /** What went wrong and what to do next, in plain language. Safe to show to your users. */
  readonly detail: string | undefined;
  /** The request's id. Quote it to support. */
  readonly requestId: string | undefined;
  /** The invalid fields of a `422 VALIDATION_FAILED`; empty otherwise. */
  readonly errors: FieldError[];
  /** A URI naming the problem class. */
  readonly type: string | undefined;
  /** The response headers, when the API answered. */
  readonly headers: Headers | undefined;

  constructor(message: string, init: PantechErrorInit = {}) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.status = init.status;
    this.code = init.code;
    this.title = init.title;
    this.detail = init.detail;
    this.requestId = init.requestId;
    this.errors = init.errors ?? [];
    this.type = init.type;
    this.headers = init.headers;
  }
}

/** `400`: the request was malformed, e.g. a missing header or a bad filter. */
export class BadRequestError extends PantechError {
  override name = "BadRequestError";
}
/** `401`: the API key is missing, wrong, expired or revoked. */
export class AuthenticationError extends PantechError {
  override name = "AuthenticationError";
}
/**
 * `402`: the change costs more than the organization can pay, e.g.
 * `INSUFFICIENT_CREDIT`. Also thrown by `domains.orders.wait()` for an order
 * `awaiting_payment` (code `AWAITING_PAYMENT`), with its `paymentUrl`.
 */
export class PaymentRequiredError extends PantechError {
  override name = "PaymentRequiredError";
  /**
   * For a domain order waiting in `awaiting_payment`: the page where the bank
   * asks the user to confirm the saved-card payment (US dollars only), when it
   * does. Undefined when no confirmation is needed, for a naira order waiting
   * for credit, and for a `402` answer.
   */
  readonly paymentUrl: string | undefined;
  /** When an unpaid order fails `insufficient_credit` (nothing is charged). */
  readonly paymentExpiresAt: string | undefined;
  /** The order waiting for payment, as the API returned it. */
  readonly order: unknown;
  constructor(
    message: string,
    init: PantechErrorInit & { paymentUrl?: string; paymentExpiresAt?: string; order?: unknown } = {},
  ) {
    super(message, init);
    this.paymentUrl = init.paymentUrl;
    this.paymentExpiresAt = init.paymentExpiresAt;
    this.order = init.order;
  }
}
/** `403`: the key may not do this, e.g. `INSUFFICIENT_SCOPE` or `AI_APPS_DISABLED`. */
export class PermissionDeniedError extends PantechError {
  override name = "PermissionDeniedError";
}
/** `404`: no such resource in your organization. */
export class NotFoundError extends PantechError {
  override name = "NotFoundError";
}
/** `409`: the resource is in a state that does not allow this, or a name is taken. */
export class ConflictError extends PantechError {
  override name = "ConflictError";
}
/** `412 VERSION_CONFLICT`: the resource changed since you read it. Read it again and retry. */
export class PreconditionFailedError extends PantechError {
  override name = "PreconditionFailedError";
}
/** `422 VALIDATION_FAILED`: see `errors` for each invalid field. */
export class ValidationError extends PantechError {
  override name = "ValidationError";
}
/** `429`: a rate limit was hit and the retries ran out. */
export class RateLimitError extends PantechError {
  override name = "RateLimitError";
  /** Seconds the API asked to wait (`Retry-After`), when it said. */
  readonly retryAfterSeconds: number | undefined;
  constructor(message: string, init: PantechErrorInit & { retryAfterSeconds?: number } = {}) {
    super(message, init);
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}
/** `5xx`: something failed on the API's side and the retries ran out. */
export class InternalServerError extends PantechError {
  override name = "InternalServerError";
}

/** The API could not be reached, or the connection dropped. */
export class APIConnectionError extends PantechError {
  override name = "APIConnectionError";
}
/** The API did not answer within the timeout. */
export class APITimeoutError extends APIConnectionError {
  override name = "APITimeoutError";
}

/** An operation the SDK waited for finished with `status: failed`. */
export class OperationFailedError extends PantechError {
  override name = "OperationFailedError";
  /** The failed operation, as `GET /operations/{id}` returned it. */
  readonly operation: unknown;
  constructor(message: string, operation: unknown, init: PantechErrorInit = {}) {
    super(message, init);
    this.operation = operation;
  }
}
/**
 * An instance, database or domain order the SDK waited for ended `failed`
 * or `payment_failed`. `code` is the order's `failure_code`.
 */
export class OrderFailedError extends PantechError {
  override name = "OrderFailedError";
  /** The failed order. */
  readonly order: unknown;
  constructor(message: string, order: unknown, init: PantechErrorInit = {}) {
    super(message, init);
    this.order = order;
  }
}
/** A cloud connection's check or a scan ended `failed`. `code` is stable; `detail` says what to do. */
export class CloudFailedError extends PantechError {
  override name = "CloudFailedError";
  /** `connection` or `scan`. */
  readonly kind: "connection" | "scan";
  /** The failed connection or scan, as the API returned it. */
  readonly resource: unknown;
  constructor(message: string, kind: "connection" | "scan", resource: unknown, init: PantechErrorInit = {}) {
    super(message, init);
    this.kind = kind;
    this.resource = resource;
  }
}
/**
 * A DNS zone or record set the SDK waited for ended `failed` (or the zone is
 * being deleted). `code` is its `failure_code`, e.g. `invalid_change` or
 * `delegation_timeout`. A failed record change leaves its last good values
 * answering.
 */
export class DNSFailedError extends PantechError {
  override name = "DNSFailedError";
  /** `zone` or `record`. */
  readonly kind: "zone" | "record";
  /** The zone or record set, as the API returned it. */
  readonly resource: unknown;
  constructor(message: string, kind: "zone" | "record", resource: unknown, init: PantechErrorInit = {}) {
    super(message, init);
    this.kind = kind;
    this.resource = resource;
  }
}
/**
 * A certificate the SDK waited for ended `failed`, `revoked` or `expired`.
 * `code` is its `failure_code` (e.g. `validation_timeout`, `caa_forbidden`),
 * or the status when it has none.
 */
export class CertificateFailedError extends PantechError {
  override name = "CertificateFailedError";
  /** The certificate, as the API returned it. */
  readonly certificate: unknown;
  constructor(message: string, certificate: unknown, init: PantechErrorInit = {}) {
    super(message, init);
    this.certificate = certificate;
  }
}
/** Waiting for an operation, order or change took longer than `timeoutMs`. */
export class WaitTimeoutError extends PantechError {
  override name = "WaitTimeoutError";
}
/** A webhook delivery's `Pantech-Signature` did not verify. */
export class WebhookVerificationError extends PantechError {
  override name = "WebhookVerificationError";
}

/**
 * The problem `code`s Pantech DNS answers with, besides the platform's usual
 * ones (`VALIDATION_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `IDEMPOTENCY_CONFLICT`,
 * `INSUFFICIENT_DELETE_SCOPE`, `RATE_LIMITED`…).
 */
export const DNS_ERROR_CODES = [
  "DNS_UNAVAILABLE",
  "DNS_ZONE_NOT_FOUND",
  "DNS_RECORD_NOT_FOUND",
  "DNS_ZONE_LIMIT_REACHED",
  "DNS_ZONE_CREATE_LIMIT_REACHED",
  "DNS_RECORD_LIMIT_REACHED",
  "DNS_ZONE_NAME_TAKEN",
  "DNS_ZONE_ACTIVE_ELSEWHERE",
  "DNS_RECORD_EXISTS",
  "DNS_CNAME_CONFLICT",
  "DNS_RECORD_READ_ONLY",
  "DNS_ZONE_SUSPENDED",
  "DNS_ZONE_NOT_WRITABLE",
  "DNS_ZONE_IN_USE_BY_DOMAIN",
  "VERSION_CONFLICT",
  "TOO_MANY_CHANGES",
  "INVALID_ZONE_FILE",
] as const;
export type DNSErrorCode = (typeof DNS_ERROR_CODES)[number];

/** The problem `code`s of domain registration. */
export const DOMAIN_ERROR_CODES = [
  "DOMAINS_UNAVAILABLE",
  "DOMAIN_NOT_FOUND",
  "DOMAIN_ORDER_NOT_FOUND",
  "DOMAIN_LOOKUP_UNAVAILABLE",
  "TLD_NOT_SOLD",
  "DOMAIN_NOT_AVAILABLE",
  "DOMAIN_NOT_TRANSFERABLE",
  "DOMAIN_ALREADY_HELD",
  "DOMAIN_ORDER_IN_FLIGHT",
  "DOMAIN_ORDER_NOT_AWAITING_PAYMENT",
  "DOMAIN_ORDER_LIMIT_REACHED",
  "DOMAIN_NOT_CONFIGURABLE",
  "DOMAIN_LOCKED",
  "DOMAIN_ZONE_MISMATCH",
] as const;
export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

/** The problem `code`s of the container registry. */
export const REGISTRY_ERROR_CODES = [
  "REGISTRY_UNAVAILABLE",
  "REGISTRY_NAMESPACE_NOT_SET",
  "REGISTRY_NAMESPACE_TAKEN",
  "REGISTRY_NAMESPACE_LOCKED",
  "INVALID_REGISTRY_NAMESPACE",
  "INVALID_REPOSITORY_NAME",
  "REPOSITORY_NOT_FOUND",
  "TAG_NOT_FOUND",
  "REGISTRY_TOKEN_NOT_FOUND",
  "REPOSITORY_EXISTS",
  "REPOSITORY_LIMIT_REACHED",
  "REGISTRY_STORAGE_LIMIT_REACHED",
  "REGISTRY_TOKEN_LIMIT_REACHED",
  "TAG_IMMUTABLE",
  "REPOSITORY_SUSPENDED",
] as const;
export type RegistryErrorCode = (typeof REGISTRY_ERROR_CODES)[number];

/** The problem `code`s of teams and access policies. */
export const IAM_ERROR_CODES = [
  "ACCESS_DENIED",
  "IAM_TEAM_NOT_FOUND",
  "IAM_POLICY_NOT_FOUND",
  "IAM_ATTACHMENT_NOT_FOUND",
  "IAM_TEAM_NAME_TAKEN",
  "IAM_POLICY_NAME_TAKEN",
  "IAM_TEAM_LIMIT_REACHED",
  "IAM_POLICY_LIMIT_REACHED",
  "IAM_ATTACHMENT_LIMIT_REACHED",
  "IAM_MANAGED_POLICY",
  "IAM_ADMIN_TARGET",
  "INVALID_POLICY",
  "VERSION_CONFLICT",
] as const;
export type IamErrorCode = (typeof IAM_ERROR_CODES)[number];

/** The problem `code`s of Certificate Manager. */
export const CERTIFICATE_ERROR_CODES = [
  "CERTIFICATES_UNAVAILABLE",
  "CERTIFICATE_NOT_FOUND",
  "CERTIFICATE_LIMIT_REACHED",
  "CERTIFICATE_REQUEST_LIMIT_REACHED",
  "CERTIFICATE_RATE_LIMITED",
  "CERTIFICATE_IN_USE",
  "CERTIFICATE_NOT_EXPORTABLE",
  "CERTIFICATE_NOT_ISSUED",
  "CERTIFICATE_NOT_REVOCABLE",
  "CERTIFICATE_NOT_IMPORTED",
  "CERTIFICATE_NOT_PENDING",
  "CERTIFICATE_NAMES_MISMATCH",
  "CONFLICT",
] as const;
export type CertificateErrorCode = (typeof CERTIFICATE_ERROR_CODES)[number];

/** True when `err` is a PantechError, and, if `code` is given, carries that code. */
export function isPantechError(
  err: unknown,
  code?: DNSErrorCode | DomainErrorCode | RegistryErrorCode | IamErrorCode | CertificateErrorCode | (string & {}),
): err is PantechError {
  return err instanceof PantechError && (code === undefined || err.code === code);
}

const STATUS_TEXT: Record<number, string> = {
  400: "Bad request",
  401: "Unauthorized",
  402: "Payment required",
  403: "Forbidden",
  404: "Not found",
  405: "Method not allowed",
  409: "Conflict",
  412: "Precondition failed",
  413: "Request too large",
  415: "Unsupported media type",
  422: "Validation failed",
  429: "Too many requests",
  500: "Internal server error",
  502: "Bad gateway",
  503: "Service unavailable",
  504: "Gateway timeout",
};

interface ProblemBody {
  type?: unknown;
  title?: unknown;
  code?: unknown;
  detail?: unknown;
  request_id?: unknown;
  errors?: unknown;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

function fieldErrors(v: unknown): FieldError[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    .map((e) => ({ field: String(e.field ?? ""), code: String(e.code ?? ""), message: String(e.message ?? "") }));
}

/**
 * Builds the error for a non-2xx response from its problem document. A body
 * that is not one (a proxy's HTML error page, say) is never shown: the status
 * says what happened.
 */
export function errorFromResponse(
  status: number,
  headers: Headers,
  bodyText: string,
  retryAfterSeconds?: number,
): PantechError {
  let problem: ProblemBody | undefined;
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) problem = parsed as ProblemBody;
  } catch {
    problem = undefined;
  }
  const code = str(problem?.code);
  const title = str(problem?.title);
  let detail = str(problem?.detail);
  const errors = fieldErrors(problem?.errors);
  const requestId = str(problem?.request_id) ?? headers.get("x-request-id") ?? undefined;
  const isProblem = code !== undefined || detail !== undefined || title !== undefined || errors.length > 0;

  if (!isProblem) {
    const text = STATUS_TEXT[status] ?? `HTTP ${status}`;
    detail =
      status >= 500
        ? `The Pantech API is temporarily unavailable (${status} ${text}). Try again in a moment.`
        : `The Pantech API refused the request (${status} ${text}).`;
  }

  let message = detail ?? title ?? STATUS_TEXT[status] ?? `HTTP ${status}`;
  const tags = [code, requestId ? `request ${requestId}` : undefined].filter(Boolean);
  if (tags.length > 0) message += ` (${tags.join(", ")})`;

  const init: PantechErrorInit = {
    status,
    code,
    title,
    detail,
    requestId,
    errors,
    type: str(problem?.type),
    headers,
  };
  switch (true) {
    case status === 400:
      return new BadRequestError(message, init);
    case status === 401:
      return new AuthenticationError(message, init);
    case status === 402:
      return new PaymentRequiredError(message, init);
    case status === 403:
      return new PermissionDeniedError(message, init);
    case status === 404:
      return new NotFoundError(message, init);
    case status === 409:
      return new ConflictError(message, init);
    case status === 412:
      return new PreconditionFailedError(message, init);
    case status === 422:
      return new ValidationError(message, init);
    case status === 429:
      return new RateLimitError(message, { ...init, retryAfterSeconds });
    case status >= 500:
      return new InternalServerError(message, init);
    default:
      return new PantechError(message, init);
  }
}
