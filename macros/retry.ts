import type { Empty, Macro } from "../core.ts";
import { sleep } from "../helpers.ts";

export type RetryMeta = { retry?: { times: number; delayMs: number } };
export const RETRY_SENTINEL = Symbol("retry");

export type RetrySignal = { readonly __type: typeof RETRY_SENTINEL; readonly error: unknown };
export const isRetrySignal = (x: unknown): x is RetrySignal =>
  typeof x === "object" && x !== null && (x as { __type?: symbol }).__type === RETRY_SENTINEL;

export const retryMacro: Macro<RetryMeta, Empty, Empty> = {
  name: "retry",
  match: (m) => !!m.retry,
  onError: (_base, _meta, err) => ({ __type: RETRY_SENTINEL, error: err }),
};

export const retryFromMeta = (m?: RetryMeta) => <T>(fn: () => Promise<T>) =>
  runWithRetry(fn, m?.retry?.times ?? 1, m?.retry?.delayMs ?? 0);

export async function runWithRetry<T>(
  fn: () => Promise<T>,
  times = 1,
  delayMs = 0,
  signal = isRetrySignal,
): Promise<T> {
  let lastSignal: RetrySignal | undefined;

  for (let i = 0; i < times; i++) {
    let value: unknown;
    let threw = false;

    try {
      value = await fn();
    } catch (err) {
      threw = true;
      if (signal(err)) {
        lastSignal = err;
      } else {
        throw err;
      }
    }

    if (!threw) {
      if (!signal(value)) return value as T;
      lastSignal = value;
    }

    if (i < times - 1) await sleep(delayMs);
  }

  const finalError = lastSignal?.error ?? new Error("retry: exhausted");
  if (finalError instanceof Error) throw finalError;
  throw new Error(typeof finalError === "string" ? finalError : "retry: exhausted", {
    cause: finalError,
  });
}
