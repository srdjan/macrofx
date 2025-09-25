import type { Empty, Macro } from "../core.ts";

// Configuration constants
const MAX_CACHE_SIZE = 1000;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour default

export type CacheMeta = {
  cacheKey?: string;
  cacheTTL?: number; // milliseconds, optional TTL
};

type CacheEntry<T = unknown> = {
  value: T;
  expiry: number | undefined;
  accessCount: number;
  lastAccessed: number;
};

// Use a Map with LRU eviction and TTL support
const store = new Map<string, CacheEntry>();

// Helper to check if entry is expired
const isExpired = (entry: CacheEntry): boolean => {
  return entry.expiry !== undefined && Date.now() > entry.expiry;
};

// Helper to evict least recently used entry
const evictLRU = (): void => {
  let lruKey: string | undefined;
  let lruTime = Infinity;

  for (const [key, entry] of store.entries()) {
    if (entry.lastAccessed < lruTime) {
      lruTime = entry.lastAccessed;
      lruKey = key;
    }
  }

  if (lruKey !== undefined) {
    store.delete(lruKey);
  }
};

// Helper to clean expired entries periodically
let cleanupTimer: number | undefined;
const scheduleCleanup = (): void => {
  if (cleanupTimer !== undefined) return;

  cleanupTimer = setTimeout(() => {
    cleanupTimer = undefined;
    for (const [key, entry] of store.entries()) {
      if (isExpired(entry)) {
        store.delete(key);
      }
    }
    // Reschedule if there are still entries with expiry
    const hasExpiringEntries = Array.from(store.values()).some(e => e.expiry !== undefined);
    if (hasExpiringEntries) {
      scheduleCleanup();
    }
  }, 60000) as unknown as number; // Clean every minute
};

export const cacheMacro: Macro<CacheMeta, Empty, Empty> = {
  name: "cache",
  match: (m) => !!m.cacheKey,
  before: (_ctx, meta) => {
    const k = meta.cacheKey!;
    const entry = store.get(k);

    if (entry) {
      // Check if expired
      if (isExpired(entry)) {
        store.delete(k);
        return undefined;
      }

      // Update access stats for LRU
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      return entry.value;
    }

    return undefined;
  },
  after: (_ctx, meta, result) => {
    const k = meta.cacheKey!;

    // Check cache size limit
    if (store.size >= MAX_CACHE_SIZE && !store.has(k)) {
      evictLRU();
    }

    // Calculate expiry time - only set if TTL is explicitly provided
    const ttl = meta.cacheTTL;
    const expiry = ttl && ttl > 0 ? Date.now() + ttl : undefined;

    // Store the result
    store.set(k, {
      value: result,
      expiry,
      accessCount: 1,
      lastAccessed: Date.now(),
    });

    // Schedule cleanup if needed
    if (expiry !== undefined) {
      scheduleCleanup();
    }

    return result;
  },
};

// Export utility functions for cache management
export const clearCache = (): void => {
  store.clear();
  if (cleanupTimer !== undefined) {
    clearTimeout(cleanupTimer);
    cleanupTimer = undefined;
  }
};

export const getCacheStats = (): {
  size: number;
  maxSize: number;
  entries: Array<{ key: string; accessCount: number; hasExpiry: boolean }>;
} => {
  return {
    size: store.size,
    maxSize: MAX_CACHE_SIZE,
    entries: Array.from(store.entries()).map(([key, entry]) => ({
      key,
      accessCount: entry.accessCount,
      hasExpiry: entry.expiry !== undefined,
    })),
  };
};