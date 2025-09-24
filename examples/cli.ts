import {
  createPipeline, type Step,
  envMacro, type EnvMeta,
  cacheMacro, type CacheMeta,
  retryMacro, runWithRetry, type RetryMeta,
  timeoutMacro, type TimeoutMeta, timeoutWrapper
} from '../mod.ts'

type Meta = EnvMeta & CacheMeta & RetryMeta & TimeoutMeta
type Base = { startedAt: number }
const makeBase = (): Base => ({ startedAt: Date.now() })

const macros = [envMacro, cacheMacro, retryMacro, timeoutMacro] as const
const { execute } = createPipeline<Meta, Base, typeof macros>(macros, makeBase)

type Out = string

const readSecrets: Step<Meta, Base, typeof macros, Out> = {
  name: 'read-secrets',
  meta: { env: ['API_TOKEN', 'HOME'], cacheKey: 'secrets:v1' },
  run: (ctx) => {
    const token = (ctx as any).env?.API_TOKEN ?? 'missing'
    return `secrets(${String(token).slice(0,4)}...)`
  }
}

const flaky: Step<Meta, Base, typeof macros, Out> = {
  name: 'flaky-fetch',
  meta: { retry: { times: 4, delayMs: 100 }, timeoutMs: 1500 },
  async run() {
    if (Math.random() < 0.7) throw new Error('network!')
    await new Promise(r => setTimeout(r, 200))
    return 'ok'
  }
}

async function main() {
  const t = timeoutWrapper<string>(flaky.meta.timeoutMs, 'flaky timeout')
  console.log(await execute(readSecrets))
  console.log(await execute(readSecrets))
  const result = await runWithRetry(() => t(() => execute(flaky)), flaky.meta.retry?.times, flaky.meta.retry?.delayMs)
  console.log('flaky:', result)
}
if (import.meta.main) main()
