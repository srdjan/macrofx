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

// Performance optimization: check dev mode once at module load
const IS_DEVELOPMENT = (() => {
  try {
    const g = globalThis as {
      Deno?: { env?: { get?: (k: string) => string | undefined } };
      process?: { env?: Record<string, string | undefined> };
    };
    const denoEnv = g.Deno?.env?.get?.("NODE_ENV");
    const nodeEnv = g.process?.env?.NODE_ENV;
    return (denoEnv ?? nodeEnv) !== "production";
  } catch {
    return true;
  }
})();

// Using unknown for better type safety while maintaining flexibility
type AnyMacro = Macro<unknown, unknown, unknown>;
type MatchMetaOf<M> = M extends { match: (m: infer Mm) => unknown } ? Mm : unknown;
type ResolveReturn<M> = M extends { resolve: (...args: unknown[]) => infer R } ? Awaited<R>
  : Record<never, never>;
type AddedOf<M, Met> = Met extends MatchMetaOf<M> ? ResolveReturn<M> : Record<never, never>;
type AddedFrom<Ms extends readonly AnyMacro[], Met> = Ms extends [infer H, ...infer T] ?
    & (H extends AnyMacro ? AddedOf<H, Met> : Record<never, never>)
    & (T extends readonly AnyMacro[] ? AddedFrom<T, Met> : Record<never, never>)
  : Record<never, never>;

export type Step<
  Met,
  BaseCtx,
  Ms extends readonly AnyMacro[],
  Out,
  SpecificMeta extends Met = Met,
> = {
  name: string;
  meta: SpecificMeta;
  run: StepFn<BaseCtx & AddedFrom<Ms, SpecificMeta>, Out>;
};

export function createPipeline<Met extends object, BaseCtx, Ms extends readonly AnyMacro[]>(
  macros: Ms,
  makeBase: () => BaseCtx,
) {
  async function execute<Out, SpecificMeta extends Met>(
    s: Step<Met, BaseCtx, Ms, Out, SpecificMeta>,
  ): Promise<Out> {
    // 1) validate
    const { meta } = s;
    const active = macros.filter((m) => m.match(meta));
    for (const m of active) m.validate?.(meta);

    // 2) resolve -> build typed capability context
    const base = makeBase();
    const added: Record<string, unknown> = {};
    const resolved = await Promise.all(
      active.map((m) => (m.resolve ? m.resolve(base, meta) : undefined)),
    );
    const seen = new Set<string>();
    for (let i = 0; i < active.length; i++) {
      const obj = resolved[i];
      if (!obj) continue;
      for (const k of Object.keys(obj as Record<string, unknown>)) {
        if (IS_DEVELOPMENT && seen.has(k)) console.warn("macrofx: duplicate ctx key:", k);
        seen.add(k);
      }
      Object.assign(added, obj as Record<string, unknown>);
    }
    const ctx = { ...base, ...added } as BaseCtx & AddedFrom<Ms, SpecificMeta>;

    // 3) before (guards / priming effects)
    for (const m of active) {
      if (m.before) {
        const short = await m.before(ctx, meta);
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
        // onError has access to the full context, not just BaseCtx
        const v = m.onError?.(ctx, meta, err);
        if (typeof v !== "undefined") return v as Out;
      }
      throw err;
    }

    // 6) after (telemetry / wrapping / transformation)
    for (const m of active) {
      if (m.after) {
        const maybe = await m.after(ctx, meta, result);
        if (typeof maybe !== "undefined") result = maybe;
      }
    }

    return result as Out;
  }

  return { execute };
}
