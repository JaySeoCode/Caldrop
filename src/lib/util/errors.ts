/**
 * A single error type that API routes know how to turn into a safe response.
 * Internal details never reach the client: only `code` + `message`.
 */
export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'CALENDAR_NOT_CONNECTED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'PAYMENT_REQUIRED'
  | 'FEATURE_DISABLED'
  | 'AI_FAILED'
  | 'CALENDAR_FAILED'
  | 'CONFLICT'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  CALENDAR_NOT_CONNECTED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  PAYMENT_REQUIRED: 402,
  FEATURE_DISABLED: 403,
  AI_FAILED: 502,
  CALENDAR_FAILED: 502,
  CONFLICT: 409,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toErrorPayload(error: unknown): {
  status: number;
  body: { error: { code: AppErrorCode; message: string; details?: Record<string, unknown> } };
} {
  if (isAppError(error)) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message, details: error.details } },
    };
  }
  // Unknown errors are logged server-side and reported generically.
  console.error('[caldrop] unhandled error', error);
  return {
    status: 500,
    body: { error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } },
  };
}
