import { createPipeline, type Step } from "../mod.ts";

type Meta = { feature?: string; fallback?: string };
type Base = { enabled: Set<string> };
type Response = { ok: boolean; message: string };

const featureFlagMacro = {
  name: "feature-flag",
  match: (meta: Meta) => typeof meta.feature === "string",
  before: (ctx: Base, meta: Meta) => {
    if (!ctx.enabled.has(meta.feature!)) {
      return { ok: false, message: `feature ${meta.feature} disabled` };
    }
  },
} as const;

const fallbackMacro = {
  name: "fallback",
  match: (meta: Meta) => typeof meta.fallback === "string",
  onError: (_base: Base, meta: Meta, err: unknown) => ({
    ok: false,
    message: meta.fallback ?? String(err),
  }),
} as const;

const macros = [featureFlagMacro, fallbackMacro] as const;
const makeBase = (): Base => ({ enabled: new Set(["beta-report"]) });
const { execute } = createPipeline<Meta, Base, typeof macros>(macros, makeBase);

type DisabledMeta = { feature: "new-dashboard" };
type RiskyMeta = { feature: "beta-report"; fallback: "served cached report" };

const disabledStep: Step<Meta, Base, typeof macros, Response, DisabledMeta> = {
  name: "disabled-feature",
  meta: { feature: "new-dashboard" },
  run: () => ({ ok: true, message: "ran feature code" }),
};

const riskyStep: Step<Meta, Base, typeof macros, Response, RiskyMeta> = {
  name: "risky-feature",
  meta: { feature: "beta-report", fallback: "served cached report" },
  run: () => {
    throw new Error("upstream unavailable");
  },
};

if (import.meta.main) {
  execute(disabledStep).then(console.log);
  execute(riskyStep).then(console.log);
}
