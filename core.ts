export type StepFn<Ctx, Out> = (ctx: Ctx) => Promise<Out> | Out

export type Macro<Meta, BaseCtx, AddedCtx> = {
  name: string
  match: (meta: Meta) => boolean
  validate?: (meta: Meta) => void
  resolve?: (base: BaseCtx, meta: Meta) => Promise<AddedCtx> | AddedCtx
  before?: (ctx: BaseCtx & AddedCtx, meta: Meta) => Promise<void | unknown> | void | unknown
  after?:  (ctx: BaseCtx & AddedCtx, meta: Meta, result: unknown) => unknown | void
  onError?: (base: BaseCtx, meta: Meta, err: unknown) => unknown | void
}

type AnyMacro = Macro<any, any, any>
type AddedOf<M extends AnyMacro, Met, Base> =
  M['resolve'] extends (b: Base, m: infer Mm) => infer R
    ? (Met extends Mm ? Awaited<R> : {})
    : {}
type AddedFrom<Ms extends readonly AnyMacro[], Met, Base> =
  Ms extends [infer H, ...infer T]
    ? H extends AnyMacro
      ? T extends readonly AnyMacro[]
        ? AddedOf<H, Met, Base> & AddedFrom<T, Met, Base>
        : AddedOf<H, Met, Base>
      : {}
    : {}

export type Step<Met, BaseCtx, Ms extends readonly AnyMacro[], Out> = {
  name: string
  meta: Met
  run: StepFn<BaseCtx & AddedFrom<Ms, Met, BaseCtx>, Out>
}

export function createPipeline<Met extends object, BaseCtx, Ms extends readonly AnyMacro[]>(
  macros: Ms,
  makeBase: () => BaseCtx
) {
  async function execute<Out>(s: Step<Met, BaseCtx, Ms, Out>): Promise<Out> {
    // 1) validate
    for (const m of macros) if (m.match(s.meta)) m.validate?.(s.meta)

    // 2) resolve -> build typed capability context
    const base = makeBase()
    let added: any = {}
    for (const m of macros) if (m.match(s.meta) && m.resolve) {
      Object.assign(added, await m.resolve(base, s.meta))
    }
    const ctx: any = { ...base, ...added }

    // 3) before (guards / priming effects)
    for (const m of macros) if (m.match(s.meta) && m.before) {
      const short = await m.before(ctx, s.meta)
      if (typeof short !== 'undefined') return short as Out
    }

    // 4) run
    let result: any
    try {
      result = await s.run(ctx)
    } catch (err) {
      // 5) onError — first macro that returns a value “handles” the error
      for (const m of macros) if (m.match(s.meta)) {
        const v = m.onError?.(base, s.meta, err)
        if (typeof v !== 'undefined') return v as Out
      }
      throw err
    }

    // 6) after (telemetry / wrapping / transformation)
    for (const m of macros) if (m.match(s.meta) && m.after) {
      const maybe = await m.after(ctx, s.meta, result)
      if (typeof maybe !== 'undefined') result = maybe
    }

    return result as Out
  }

  return { execute }
}
