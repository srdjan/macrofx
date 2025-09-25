// Result type for consistent error handling across macrofx
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

// Smart constructors
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

// Type guards
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok === true;
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => result.ok === false;

// Utility functions
export const map = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> => {
  return isOk(result) ? ok(fn(result.value)) : result;
};

export const mapErr = <T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> => {
  return isErr(result) ? err(fn(result.error)) : result;
};

export const flatMap = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> => {
  return isOk(result) ? fn(result.value) : result;
};

export const unwrapOr = <T, E>(
  result: Result<T, E>,
  defaultValue: T,
): T => {
  return isOk(result) ? result.value : defaultValue;
};

export const unwrapOrElse = <T, E>(
  result: Result<T, E>,
  fn: (error: E) => T,
): T => {
  return isOk(result) ? result.value : fn(result.error);
};

// Async utilities
export const mapAsync = async <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<U>,
): Promise<Result<U, E>> => {
  if (isOk(result)) {
    try {
      return ok(await fn(result.value));
    } catch (error) {
      // If the async function throws, we need to handle it
      throw error;
    }
  }
  return result;
};

export const flatMapAsync = async <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>,
): Promise<Result<U, E>> => {
  return isOk(result) ? await fn(result.value) : result;
};

// Combine multiple results
export const all = <T, E>(
  results: readonly Result<T, E>[],
): Result<readonly T[], E> => {
  const values: T[] = [];
  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
};

// Try-catch wrapper
export const tryCatch = <T, E = Error>(
  fn: () => T,
  mapError?: (error: unknown) => E,
): Result<T, E> => {
  try {
    return ok(fn());
  } catch (error) {
    const mappedError = mapError ? mapError(error) : error as E;
    return err(mappedError);
  }
};

export const tryCatchAsync = async <T, E = Error>(
  fn: () => Promise<T>,
  mapError?: (error: unknown) => E,
): Promise<Result<T, E>> => {
  try {
    return ok(await fn());
  } catch (error) {
    const mappedError = mapError ? mapError(error) : error as E;
    return err(mappedError);
  }
};