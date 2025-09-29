// Instance-based cache with optional TTL and LRU eviction.
// Small, dependency-free helper to complement macrofx macros.

export type Cache<K, V> = {
  readonly get: (key: K) => V | undefined;
  readonly set: (key: K, value: V, ttlMs?: number) => void;
  readonly invalidateKey: (key: K) => void;
  readonly invalidateWhere: (predicate: (key: K, value: V) => boolean) => void;
  readonly clear: () => void;
};

type Entry<V> = {
  v: V;
  exp?: number; // expiry timestamp (ms since epoch)
  at: number; // last accessed timestamp (for LRU)
};

export const createCache = <K, V>(opts?: {
  maxSize?: number; // LRU max size (default: 1000)
  defaultTtlMs?: number; // default TTL for set() without explicit ttlMs
}): Cache<K, V> => {
  const maxSize = Math.max(1, opts?.maxSize ?? 1000);
  const defaultTtlMs = opts?.defaultTtlMs;
  const map = new Map<K, Entry<V>>();

  const now = () => Date.now();

  const isExpired = (e: Entry<V>): boolean =>
    typeof e.exp === "number" && now() > e.exp;

  const updateAccess = (e: Entry<V>) => {
    e.at = now();
  };

  const evictLRU = () => {
    if (map.size <= maxSize) return;
    let lruKey: K | undefined;
    let lruAt = Infinity;
    for (const [k, e] of map.entries()) {
      if (e.at < lruAt) {
        lruAt = e.at;
        lruKey = k;
      }
    }
    if (typeof lruKey !== "undefined") map.delete(lruKey);
  };

  const get = (key: K): V | undefined => {
    const e = map.get(key);
    if (!e) return undefined;
    if (isExpired(e)) {
      map.delete(key);
      return undefined;
    }
    updateAccess(e);
    return e.v;
  };

  const set = (key: K, value: V, ttlMs?: number): void => {
    const exp = typeof (ttlMs ?? defaultTtlMs) === "number"
      ? now() + (ttlMs ?? defaultTtlMs!)
      : undefined;
    const e: Entry<V> = { v: value, exp, at: now() };
    map.set(key, e);
    // simple single-step eviction (good enough in practice)
    if (map.size > maxSize) evictLRU();
  };

  const invalidateKey = (key: K): void => {
    map.delete(key);
  };

  const invalidateWhere = (predicate: (key: K, value: V) => boolean): void => {
    for (const [k, e] of map.entries()) {
      if (predicate(k, e.v)) map.delete(k);
    }
  };

  const clear = (): void => {
    map.clear();
  };

  return { get, set, invalidateKey, invalidateWhere, clear } as const;
};
