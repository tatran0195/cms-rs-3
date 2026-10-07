/**
 * Base error for all CMS SDK errors
 */
export class CmsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CmsError';
  }
}

/**
 * Structured API Error returned by the Axum backend
 */
export class CmsApiError extends CmsError {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;
  readonly response?: Response;
  readonly request?: Request;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
    response?: Response;
    request?: Request;
  }) {
    super(params.message);
    this.name = 'CmsApiError';
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.requestId = params.requestId;
    this.response = params.response;
    this.request = params.request;
  }

  isNotFound(): boolean {
    return this.status === 404;
  }

  isUnauthorized(): boolean {
    return this.status === 401;
  }

  isForbidden(): boolean {
    return this.status === 403;
  }

  isConflict(): boolean {
    return this.status === 409;
  }

  isValidationError(): boolean {
    return this.status === 400 || this.code === 'VALIDATION_ERROR' || this.code === 'BAD_REQUEST';
  }

  isServerError(): boolean {
    return this.status >= 500;
  }
}

/**
 * Network connection failure error
 */
export class CmsNetworkError extends CmsError {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'CmsNetworkError';
    this.cause = cause;
  }
}

/**
 * Request timeout error
 */
export class CmsTimeoutError extends CmsError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'CmsTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}
