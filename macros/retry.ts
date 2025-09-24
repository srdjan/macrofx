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

export async function runWithRetry<T>(
  fn: () => Promise<T>,
  times = 1,
  delayMs = 0,
  signal = isRetrySignal,
): Promise<T> {
  for (let i = 0; i < times; i++) {
    const r = await fn().catch((e) => e);
    if (!signal(r)) return r as T;
    if (i < times - 1) await sleep(delayMs);
  }
  throw new Error("retry: exhausted");
}
