import type { Macro } from '../core.ts'

export type EnvMeta = { env?: string[] }
export type EnvAdded = { env: Record<string, string> }

export const envMacro: Macro<EnvMeta, {}, EnvAdded> = {
  name: 'env',
  match: m => Array.isArray(m.env),
  resolve: (_base, meta) => {
    const out: Record<string, string> = {}
    for (const k of meta.env ?? []) {
      const v = (globalThis as any).Deno?.env?.get?.(k) ?? (globalThis as any).process?.env?.[k]
      if (typeof v === 'string') out[k] = v
    }
    return { env: out }
  },
}
