import { createPipeline, type Step } from '../mod.ts'

type Meta = { fakeClock?: number; seed?: number }
type Base = {}

const fakeClockMacro = {
  name: 'fakeClock',
  match: (m: Meta) => typeof m.fakeClock === 'number',
  resolve: (_b: Base, m: Meta) => ({ now: () => m.fakeClock! })
} as const

const rngMacro = {
  name: 'rng',
  match: (m: Meta) => typeof m.seed === 'number',
  resolve: (_b: Base, m: Meta) => {
    let s = m.seed! >>> 0
    const next = () => (s = (1664525 * s + 1013904223) >>> 0) / 0xffffffff
    return { random: next }
  }
} as const

const macros = [fakeClockMacro, rngMacro] as const
const { execute } = createPipeline<Meta, Base, typeof macros>(macros, () => ({}))

const step: Step<Meta, Base, typeof macros, { ts: number; n: number }> = {
  name: 'deterministic',
  meta: { fakeClock: 1_700_000_000_000, seed: 42 },
  run: ({ now, random }) => ({ ts: now(), n: Math.round(random() * 1000) })
}

if (import.meta.main) {
  execute(step).then(console.log)
}
