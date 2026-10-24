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
/** `402`: the change costs more than the organization can pay, e.g. `INSUFFICIENT_CREDIT`. */
export class PaymentRequiredError extends PantechError {
  override name = "PaymentRequiredError";
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
/** An instance or database order the SDK waited for ended `failed` or `payment_failed`. */
export class OrderFailedError extends PantechError {
  override name = "OrderFailedError";
  /** The failed order. */
  readonly order: unknown;
  constructor(message: string, order: unknown, init: PantechErrorInit = {}) {
    super(message, init);
    this.order = order;
  }
}
/** Waiting for an operation or order took longer than `timeoutMs`. */
export class WaitTimeoutError extends PantechError {
  override name = "WaitTimeoutError";
}
/** A webhook delivery's `Pantech-Signature` did not verify. */
export class WebhookVerificationError extends PantechError {
  override name = "WebhookVerificationError";
}

/** True when `err` is a PantechError, and, if `code` is given, carries that code. */
export function isPantechError(err: unknown, code?: string): err is PantechError {
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
