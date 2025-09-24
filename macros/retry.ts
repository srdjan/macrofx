import type { Macro } from '../core.ts'
import { sleep } from '../helpers.ts'

export type RetryMeta = { retry?: { times: number; delayMs: number } }
const RETRY_SENTINEL = Symbol('retry')

export const retryMacro: Macro<RetryMeta, {}, {}> = {
  name: 'retry',
  match: m => !!m.retry,
  onError: async (_base, _meta, err) => {
    return { __type: RETRY_SENTINEL, error: err } as any
  }
}

export async function runWithRetry<T>(
  fn: () => Promise<T>,
  times = 1,
  delayMs = 0,
  isRetrySignal = (x: unknown) => typeof x === 'object' && x !== null && (x as any).__type === RETRY_SENTINEL
): Promise<T> {
  for (let i = 0; i < times; i++) {
    const r = await fn().catch(e => e)
    if (!isRetrySignal(r)) return r as T
    if (i < times - 1) await sleep(delayMs)
  }
  throw new Error('retry: exhausted')
}
