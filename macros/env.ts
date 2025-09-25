import type { Empty, Macro } from "../core.ts";

export type EnvMeta = { env?: string[] };
export type EnvAdded = { env: Record<string, string> };

export const envMacro: Macro<EnvMeta, Empty, EnvAdded> = {
  name: "env",
  match: (m) => Array.isArray(m.env),
  resolve: (_base, meta) => {
    const out: Record<string, string> = {};
    type GlobalEnv = {
      Deno?: { env?: { get?: (k: string) => string | undefined } };
      process?: { env?: Record<string, string | undefined> };
    };
    const g = globalThis as GlobalEnv;
    for (const k of meta.env ?? []) {
      let v: string | undefined;
      try {
        v = g.Deno?.env?.get?.(k);
      } catch (_) {
        v = undefined;
      }
      if (typeof v !== "string") v = g.process?.env?.[k];
      if (typeof v === "string") out[k] = v;
    }
    return { env: out };
  },
};
