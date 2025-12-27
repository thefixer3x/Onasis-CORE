/**
 * Error handling utilities for Supabase Edge Functions
 */

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EMBEDDING_ERROR = 'EMBEDDING_ERROR',
}

export interface ApiError {
  error: string;
  code: ErrorCode;
  details?: unknown;
  timestamp: string;
  request_id?: string;
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  details?: unknown
): Response {
  const error: ApiError = {
    error: message,
    code,
    details,
    timestamp: new Date().toISOString(),
    request_id: crypto.randomUUID(),
  };

  return new Response(JSON.stringify(error), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * HTTP status code mappings for error codes
 */
export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.AUTHENTICATION_ERROR]: 401,
  [ErrorCode.AUTHORIZATION_ERROR]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.EMBEDDING_ERROR]: 502,
};

/**
 * Create an error response using the error code's default status
 */
export function errorResponse(
  code: ErrorCode,
  message: string,
  details?: unknown
): Response {
  return createErrorResponse(code, message, ERROR_STATUS_MAP[code], details);
}

/**
 * Create a success response
 */
export function successResponse(
  data: unknown,
  status = 200,
  additionalFields?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({
      ...additionalFields,
      data,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
