/**
 * Explicit result type. Domain services never throw for expected failures;
 * they return `err(...)` so that the UI can render meaningful states.
 */
export type Ok<T> = { ok: true; value: T };
export type Err<E = AppError> = { ok: false; error: E };
export type Result<T, E = AppError> = Ok<T> | Err<E>;

export interface AppError {
  code: string;
  message: string;
  /** Extra structured details, safe to log. Never includes secrets. */
  details?: Record<string, unknown>;
  cause?: unknown;
}

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E = AppError>(error: E): Err<E> => ({ ok: false, error });

export function appError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  cause?: unknown,
): AppError {
  return { code, message, details, cause };
}

export function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  const e = new Error(`${r.error.code}: ${r.error.message}`);
  (e as Error & { details?: unknown }).details = r.error.details;
  throw e;
}
