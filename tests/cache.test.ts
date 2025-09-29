import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createCache } from "../lib/cache.ts";

Deno.test("cache: set/get/invalidate", () => {
  const c = createCache<string, number>({ maxSize: 10 });
  assertEquals(c.get("a"), undefined);
  c.set("a", 1);
  assertEquals(c.get("a"), 1);
  c.invalidateKey("a");
  assertEquals(c.get("a"), undefined);
});

Deno.test("cache: ttl expiry", async () => {
  const c = createCache<string, number>({ defaultTtlMs: 10 });
  c.set("x", 42);
  assertEquals(c.get("x"), 42);
  await new Promise((r) => setTimeout(r, 15));
  assertEquals(c.get("x"), undefined);
});

Deno.test("cache: LRU eviction", () => {
  const c = createCache<string, number>({ maxSize: 2 });
  c.set("a", 1);
  c.set("b", 2);
  // Access "a" to make it recently used
  assertEquals(c.get("a"), 1);
  // Insert "c" -> should evict least-recently-used ("b")
  c.set("c", 3);
  assertEquals(c.get("b"), undefined);
  assertEquals(c.get("a"), 1);
  assertEquals(c.get("c"), 3);
});

Deno.test("cache: invalidateWhere", () => {
  const c = createCache<string, number>({ maxSize: 5 });
  c.set("user:1", 1);
  c.set("user:2", 2);
  c.set("post:1", 10);
  c.invalidateWhere((k) => k.startsWith("user:"));
  assertEquals(c.get("user:1"), undefined);
  assertEquals(c.get("user:2"), undefined);
  assertEquals(c.get("post:1"), 10);
});
