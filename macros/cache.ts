import type { Empty, Macro } from "../core.ts";

export type CacheMeta = { cacheKey?: string };
const store = new Map<string, unknown>();

export const cacheMacro: Macro<CacheMeta, Empty, Empty> = {
  name: "cache",
  match: (m) => !!m.cacheKey,
  before: (_ctx, meta) => {
    const k = meta.cacheKey!;
    if (store.has(k)) return store.get(k);
  },
  after: (_ctx, meta, result) => {
    store.set(meta.cacheKey!, result);
    return result;
  },
};
