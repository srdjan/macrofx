import type { Macro } from '../core.ts'

export type SinkMeta = { sink?: 'console' | 'memory' }
const mem: unknown[] = []
export const getMemSink = () => mem

export const sinkMacro: Macro<SinkMeta, {}, { emit: (x: unknown) => void }> = {
  name: 'sink',
  match: m => !!m.sink,
  resolve: (_base, m) => {
    if (m.sink === 'console') return { emit: (x: unknown) => console.log('[EMIT]', x) }
    if (m.sink === 'memory') return { emit: (x: unknown) => { mem.push(x) } }
    return { emit: () => {} }
  }
}
