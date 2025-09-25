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

Deno.test("onError precedence and ctx visibility", async () => {
  type Meta = { boom?: boolean };
  type Base = { requestId: string };
  const makeBase = (): Base => ({ requestId: "r1" });

  const capMacro = {
    name: "cap",
    match: (m: Meta) => !!m.boom,
    resolve: () => ({ cap: 1 }),
  } as const;

  // First onError returns; should win
  const firstOnError = {
    name: "first",
    match: (m: Meta) => !!m.boom,
    onError: (ctx: Base) => `handled:${ctx.requestId}`,
  } as const;

  const secondOnError = {
    name: "second",
    match: (m: Meta) => !!m.boom,
    onError: () => "handled:second",
  } as const;

  const macros = [capMacro, firstOnError, secondOnError] as const;
  const { execute } = createPipeline<Meta, Base, typeof macros>(macros, makeBase);

  const step: Step<Meta, Base, typeof macros, never, { boom: true }> = {
    name: "err",
    meta: { boom: true },
    run: () => {
      throw new Error("fail");
    },
  };

  const out = await execute(
    step as unknown as Step<Meta, Base, typeof macros, string, { boom: true }>,
  );
  assertEquals(out, "handled:r1");
});

Deno.test("after hooks accumulate transformations in order", async () => {
  type Meta = { wrap?: boolean };
  type Base = Empty;

  const a1 = {
    name: "a1",
    match: (m: Meta) => !!m.wrap,
    after: (_ctx: Base, _m: Meta, r: unknown) => (typeof r === "number" ? (r as number) + 1 : r),
  } as const;
  const a2 = {
    name: "a2",
    match: (m: Meta) => !!m.wrap,
    after: (_ctx: Base, _m: Meta, r: unknown) => (typeof r === "number" ? (r as number) * 2 : r),
  } as const;

  const macros = [a1, a2] as const;
  const { execute } = createPipeline<Meta, Base, typeof macros>(macros, () => ({}));
  const step: Step<Meta, Base, typeof macros, number, { wrap: true }> = {
    name: "wrap2",
    meta: { wrap: true },
    run: () => 10,
  };
  const out = await execute(step);
  // (10 + 1) * 2 = 22
  assertEquals(out, 22);
});

import {
  clearMemSink,
  getMemSink,
  RETRY_SENTINEL,
  retryFromMeta,
  sinkMacro,
  type SinkMeta,
  timeoutFromMeta,
} from "../mod.ts";

Deno.test("sink macro memory mode collects and can be cleared", async () => {
  type Meta = SinkMeta;
  type Base = Empty;
  clearMemSink();
  const macros = [sinkMacro] as const;
  const { execute } = createPipeline<Meta, Base, typeof macros>(macros, () => ({}));

  const step: Step<Meta, Base, typeof macros, number, { sink: "memory" }> = {
    name: "emit",
    meta: { sink: "memory" },
    run: (ctx) => {
      (ctx as unknown as { emit: (x: unknown) => void }).emit({ a: 1 });
      (ctx as unknown as { emit: (x: unknown) => void }).emit({ b: 2 });
      return 0;
    },
  };
  await execute(step);
  assertEquals(getMemSink().length, 2);
  clearMemSink();
  assertEquals(getMemSink().length, 0);
});

Deno.test("sink macro console mode does not throw", async () => {
  type Meta = SinkMeta;
  type Base = Empty;
  const macros = [sinkMacro] as const;
  const { execute } = createPipeline<Meta, Base, typeof macros>(macros, () => ({}));
  const step: Step<Meta, Base, typeof macros, number, { sink: "console" }> = {
    name: "emit-console",
    meta: { sink: "console" },
    run: (ctx) => {
      (ctx as unknown as { emit: (x: unknown) => void }).emit({ ok: true });
      return 1;
    },
  };
  const out = await execute(step);
  assertEquals(out, 1);
});

Deno.test("retryFromMeta succeeds when sentinel is returned, and exhausts otherwise", async () => {
  let n = 0;
  const withRetry = retryFromMeta({ retry: { times: 3, delayMs: 0 } });
  const ok = await withRetry(() => {
    n++;
    if (n < 3) return { __type: RETRY_SENTINEL, error: new Error("flaky") } as unknown as never;
    return "done" as unknown as never;
  });
  assertEquals(ok, "done");

  await assertRejects(
    () => withRetry(() => ({ __type: RETRY_SENTINEL, error: new Error("always") } as never)),
    Error,
  );
});

Deno.test("timeout helpers: label is used and passthrough when ms missing", async () => {
  const withTimeout = timeoutFromMeta({ timeoutMs: 10 }, "T-LABEL");
  await assertRejects(
    () => withTimeout(() => new Promise(() => {})),
    Error,
    "T-LABEL",
  );

  const passthrough = timeoutFromMeta({}, "IGNORED");
  const v = await passthrough(() => Promise.resolve(42));
  assertEquals(v, 42);
});

Deno.test("type-level assertions for context availability", () => {
  type Meta = { cap?: boolean };
  type Base = Empty;
  const capMacro = {
    name: "cap",
    match: (m: { cap: true }) => m.cap === true,
    resolve: () => ({ cap: 1 }),
  } as const;
  const macros = [capMacro] as const;
  createPipeline<{ cap?: boolean }, Base, typeof macros>(macros, () => ({}));

  const good: Step<{ cap?: boolean }, Base, typeof macros, number, { cap: true }> = {
    name: "good",
    meta: { cap: true },
    run: ({ cap }) => cap,
  };
  void good;

  const bad: Step<Meta, Base, typeof macros, number, Empty> = {
    name: "bad",
    meta: {},
    run: (ctx) => {
      // @ts-expect-error cap is not available without meta
      const _x: { cap: number } = ctx as never;
      return 0;
    },
  };
  void bad;
});
