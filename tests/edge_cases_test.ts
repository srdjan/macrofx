import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cacheMacro,
  clearCache,
  createPipeline,
  type Empty,
  err,
  getCacheStats,
  isErr,
  isOk,
  ok,
  type Result,
  runWithRetry,
  type Step,
  tryCatch,
  tryCatchAsync,
} from "../mod.ts";

// Test cache memory management
Deno.test("cache respects TTL and evicts expired entries", async () => {
  clearCache();

  type Meta = { cacheKey?: string; cacheTTL?: number };
  type Base = Empty;
  const { execute } = createPipeline<Meta, Base, readonly [typeof cacheMacro]>(
    [cacheMacro] as const,
    () => ({}),
  );

  let callCount = 0;
  const ttlStep: Step<Meta, Base, readonly [typeof cacheMacro], number, Meta> = {
    name: "ttl",
    meta: { cacheKey: "ttl-test", cacheTTL: 50 }, // 50ms TTL
    run: () => ++callCount,
  };

  const r1 = await execute(ttlStep);
  assertEquals(r1, 1);

  // Should be cached
  const r2 = await execute(ttlStep);
  assertEquals(r2, 1);

  // Wait for expiry
  await new Promise((resolve) => setTimeout(resolve, 60));

  // Should re-execute after expiry
  const r3 = await execute(ttlStep);
  assertEquals(r3, 2);

  clearCache();
});

// Test cache stats tracking
Deno.test("cache stats tracking works correctly", async () => {
  clearCache();

  type Meta = { cacheKey?: string };
  type Base = Empty;
  const { execute } = createPipeline<Meta, Base, readonly [typeof cacheMacro]>(
    [cacheMacro] as const,
    () => ({}),
  );

  const step1: Step<Meta, Base, readonly [typeof cacheMacro], string, { cacheKey: string }> = {
    name: "s1",
    meta: { cacheKey: "stats-1" },
    run: () => "value1",
  };

  const step2: Step<Meta, Base, readonly [typeof cacheMacro], string, { cacheKey: string }> = {
    name: "s2",
    meta: { cacheKey: "stats-2" },
    run: () => "value2",
  };

  await execute(step1);
  await execute(step1); // Access again
  await execute(step2);

  const stats = getCacheStats();
  assert(stats.size >= 2);
  assert(stats.maxSize === 1000);
  const entry1 = stats.entries.find((e) => e.key === "stats-1");
  assert(entry1);
  assertEquals(entry1.accessCount, 2);

  clearCache();
});

// Test Result type utilities
Deno.test("Result type provides comprehensive error handling", () => {
  // Test ok and err constructors
  const success: Result<number, string> = ok(42);
  const failure: Result<number, string> = err("failed");

  assert(isOk(success));
  assert(!isErr(success));
  assert(!isOk(failure));
  assert(isErr(failure));

  // Test tryCatch
  const goodResult = tryCatch(() => JSON.parse('{"a": 1}'));
  assert(isOk(goodResult));
  assertEquals(goodResult.value, { a: 1 });

  const badResult = tryCatch(() => JSON.parse("invalid"));
  assert(isErr(badResult));
  assert(badResult.error instanceof SyntaxError);

  // Test with custom error mapper
  const customResult = tryCatch(
    () => {
      throw new Error("oops");
    },
    (e) => `Error: ${e}`,
  );
  assert(isErr(customResult));
  assertEquals(customResult.error, "Error: Error: oops");
});

// Test async Result utilities
Deno.test("async Result utilities handle promises correctly", async () => {
  const goodAsync = await tryCatchAsync(
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "success";
    },
  );
  assert(isOk(goodAsync));
  assertEquals(goodAsync.value, "success");

  const badAsync = await tryCatchAsync(
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error("async fail");
    },
  );
  assert(isErr(badAsync));
  assert(badAsync.error instanceof Error);
});

// Test retry with different error types
Deno.test("retry handles different error scenarios", async () => {
  let attempts = 0;

  // Test: immediate success
  const immediate = await runWithRetry(() => Promise.resolve("ok"), 3, 0);
  assertEquals(immediate, "ok");

  // Test: eventual success
  attempts = 0;
  const eventual = await runWithRetry(
    async () => {
      attempts++;
      if (attempts < 3) throw new Error("retry");
      return "success";
    },
    5,
    0,
    (e) => e instanceof Error && e.message === "retry",
  );
  assertEquals(eventual, "success");
  assertEquals(attempts, 3);

  // Test: non-retryable error
  await assertRejects(
    () =>
      runWithRetry(
        () => Promise.reject(new Error("fatal")),
        3,
        0,
        () => false, // Never retry
      ),
    Error,
    "fatal",
  );
});