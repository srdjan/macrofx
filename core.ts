export type StepFn<Ctx, Out> = (ctx: Ctx) => Promise<Out> | Out;

export type Macro<Meta, BaseCtx, AddedCtx> = {
  name: string;
  match: (meta: Meta) => boolean;
  validate?: (meta: Meta) => void;
  resolve?: (base: BaseCtx, meta: Meta) => Promise<AddedCtx> | AddedCtx;
  before?: (ctx: BaseCtx & AddedCtx, meta: Meta) => Promise<void | unknown> | void | unknown;
  after?: (ctx: BaseCtx & AddedCtx, meta: Meta, result: unknown) => unknown | void;
  onError?: (base: BaseCtx, meta: Meta, err: unknown) => unknown | void;
};

export type Empty = Record<PropertyKey, never>;

// deno-lint-ignore no-explicit-any
type AnyMacro = Macro<any, any, any>;
type MatchMetaOf<M> = M extends { match: (m: infer Mm) => unknown } ? Mm : unknown;
type ResolveReturn<M> = M extends { resolve: (...args: unknown[]) => infer R } ? Awaited<R>
  : Record<never, never>;
type AddedOf<M, Met> = Met extends MatchMetaOf<M> ? ResolveReturn<M> : Record<never, never>;
type AddedFrom<Ms extends readonly AnyMacro[], Met> = Ms extends [infer H, ...infer T] ?
    & (H extends AnyMacro ? AddedOf<H, Met> : Record<never, never>)
    & (T extends readonly AnyMacro[] ? AddedFrom<T, Met> : Record<never, never>)
  : Record<never, never>;

export type Step<Met, BaseCtx, Ms extends readonly AnyMacro[], Out> = {
  name: string;
  meta: Met;
  run: StepFn<BaseCtx & AddedFrom<Ms, Met>, Out>;
};

export function createPipeline<Met extends object, BaseCtx, Ms extends readonly AnyMacro[]>(
  macros: Ms,
  makeBase: () => BaseCtx,
) {
  async function execute<Out>(s: Step<Met, BaseCtx, Ms, Out>): Promise<Out> {
    // 1) validate
    const active = macros.filter((m) => m.match(s.meta));
    for (const m of active) m.validate?.(s.meta);

    // 2) resolve -> build typed capability context
    const base = makeBase();
    const added: Record<string, unknown> = {};
    for (const m of active) {
      if (m.resolve) {
        Object.assign(added, await m.resolve(base, s.meta));
      }
    }
    const ctx = { ...base, ...added } as BaseCtx & AddedFrom<Ms, Met>;

    // 3) before (guards / priming effects)
    for (const m of active) {
      if (m.before) {
        const short = await m.before(ctx, s.meta);
        if (typeof short !== "undefined") return short as Out;
      }
    }

    // 4) run
    let result: unknown;
    try {
      result = await s.run(ctx);
    } catch (err) {
      // 5) onError — first macro that returns a value “handles” the error
      for (const m of active) {
        const v = m.onError?.(base, s.meta, err);
        if (typeof v !== "undefined") return v as Out;
      }
      throw err;
    }

    // 6) after (telemetry / wrapping / transformation)
    for (const m of active) {
      if (m.after) {
        const maybe = await m.after(ctx, s.meta, result);
        if (typeof maybe !== "undefined") result = maybe;
      }
    }

    return result as Out;
  }

  return { execute };
}
