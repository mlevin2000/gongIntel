/**
 * Custom error hierarchy for GongIntel API.
 *
 * AppError is the base — all operational errors should extend it.
 * isOperational = true  → expected failure (bad input, 404, auth denied)
 * isOperational = false → programmer bug or unknown crash
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    // Restore prototype chain (TS downlevel emit breaks instanceof)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Resource not found (404). */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const msg = id ? `${resource} '${id}' not found` : `${resource} not found`;
    super(msg, 404, "NOT_FOUND");
  }
}

/** Authentication / authorization failure (401 or 403). */
export class AuthError extends AppError {
  constructor(message = "Unauthorized", statusCode: 401 | 403 = 401) {
    super(message, statusCode, statusCode === 401 ? "UNAUTHORIZED" : "FORBIDDEN");
  }
}

/** Validation errors — bad request body, params, env config (400). */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

/**
 * Wraps failures from external services (Google Drive, Firestore, Claude).
 * statusCode defaults to 502 (bad gateway) since the upstream failed.
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;
  public readonly originalError?: Error;

  constructor(service: string, message: string, originalError?: Error) {
    super(`[${service}] ${message}`, 502, "EXTERNAL_SERVICE_ERROR");
    this.service = service;
    this.originalError = originalError;
  }
}
