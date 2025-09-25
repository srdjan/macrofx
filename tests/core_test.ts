import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cacheMacro,
  createPipeline,
  type Empty,
  envMacro,
  retryMacro,
  runWithRetry,
  type Step,
} from "../mod.ts";

Deno.test("resolve adds typed capability", async () => {
  type Meta = { cap?: boolean };
  type Base = Empty;

  const capMacro = {
    name: "cap",
    match: (m: Meta) => m.cap === true,
    resolve: () => ({ capValue: 7 }),
  } as const;

  const { execute } = createPipeline<Meta, Base, readonly [typeof capMacro]>(
    [capMacro] as const,
    () => ({}),
  );

  const s: Step<Meta, Base, readonly [typeof capMacro], number, { cap: true }> = {
    name: "s",
    meta: { cap: true },
    run: ({ capValue }) => capValue * 3,
  };

  const out = await execute(s);
  assertEquals(out, 21);
});

Deno.test("before short-circuits", async () => {
  type Meta = { deny?: boolean };
  type Base = Empty;

  const denyMacro = {
    name: "deny",
    match: (m: Meta) => !!m.deny,
    before: () => "blocked",
  } as const;
  const { execute } = createPipeline<Meta, Base, readonly [typeof denyMacro]>(
    [denyMacro] as const,
    () => ({}),
  );

  const out = await execute({ name: "x", meta: { deny: true }, run: () => "ok" });
  assert(out === "blocked");
});

Deno.test("env macro exposes env vars", async () => {
  const key = "FX_ENV_CHECK";
  const originalProcess = (globalThis as { process?: { env?: Record<string, string> } }).process;
  (globalThis as { process?: { env?: Record<string, string> } }).process = {
    env: { [key]: "ok" },
  };
  try {
    type Meta = { env?: string[] };
    type Base = Empty;
    const macros = [envMacro] as const;
    const { execute } = createPipeline<Meta, Base, typeof macros>(macros, () => ({}));

    const step: Step<Meta, Base, typeof macros, string, { env: [typeof key] }> = {
      name: "env",
      meta: { env: [key] },
      run: ({ env }) => env[key] ?? "",
    };

    const out = await execute(step);
    assertEquals(out, "ok");
  } finally {
    if (typeof originalProcess === "undefined") {
      delete (globalThis as { process?: unknown }).process;
    } else {
      (globalThis as { process?: { env?: Record<string, string> } }).process = originalProcess;
    }
  }
});

Deno.test("cache macro caches result", async () => {
  type Meta = { cacheKey?: string };
  type Base = Empty;
  const macros = [cacheMacro] as const;
  const { execute } = createPipeline<Meta, Base, typeof macros>(macros, () => ({}));

  let runs = 0;
  const meta = { cacheKey: `cache:${crypto.randomUUID()}` } as const;
  const step: Step<Meta, Base, typeof macros, number, typeof meta> = {
    name: "cached",
    meta,
    run: () => ++runs,
  };

  const first = await execute(step);
  const second = await execute(step);

  assertEquals(first, 1);
  assertEquals(second, 1);
  assertEquals(runs, 1);
});

Deno.test("after hook can transform the result", async () => {
  type Meta = { wrap?: boolean };
  type Base = Empty;

  const wrapMacro = {
    name: "wrap",
    match: (m: Meta) => m.wrap === true,
    after: (_ctx: Base, _meta: Meta, result: unknown) => {
      if (typeof result === "number") return result + 1;
      return result;
    },
  } as const;

  const macros = [wrapMacro] as const;
  const { execute } = createPipeline<Meta, Base, typeof macros>(macros, () => ({}));

  const step: Step<Meta, Base, typeof macros, number, { wrap: true }> = {
    name: "wrap",
    meta: { wrap: true },
    run: () => 1,
  };

  const out = await execute(step);
  assertEquals(out, 2);
});

Deno.test("runWithRetry surfaces terminal error", async () => {
  type Meta = { retry?: { times: number; delayMs: number } };
  type Base = Empty;
  const macros = [retryMacro] as const;
  const { execute } = createPipeline<Meta, Base, typeof macros>(macros, () => ({}));

  let attempts = 0;
  const step: Step<
    Meta,
    Base,
    typeof macros,
    never,
    { retry: { times: 3; delayMs: 0 } }
  > = {
    name: "retrying",
    meta: { retry: { times: 3, delayMs: 0 } },
    run: () => {
      attempts += 1;
      throw new Error(`boom ${attempts}`);
    },
  };

  await assertRejects(
    () => runWithRetry(() => execute(step), step.meta.retry.times, step.meta.retry.delayMs),
    Error,
    "boom 3",
  );
  assertEquals(attempts, 3);
});

Deno.test("runWithRetry rethrows non-retry errors", async () => {
  await assertRejects(
    () => runWithRetry(() => Promise.reject(new Error("nope"))),
    Error,
    "nope",
  );
});
