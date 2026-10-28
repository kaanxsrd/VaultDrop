/**
 * Typed application errors mapped to stable API error codes. Messages are written for end users
 * and must never include secret content, keys or internal details.
 */
export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "rate_limited"
  | "quota_exceeded"
  | "plan_restricted"
  | "secret_unavailable"
  | "invalid_proof"
  | "idempotency_mismatch"
  | "service_unavailable"
  | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  rate_limited: 429,
  quota_exceeded: 429,
  plan_restricted: 403,
  secret_unavailable: 410,
  invalid_proof: 403,
  idempotency_mismatch: 422,
  service_unavailable: 503,
  internal_error: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}
