# MacroFX Meta Capabilities, Part 2: From Prototype to Production

Part 1 introduced metadata-driven macros and kept the focus on the core loop. In this follow-up we explore how to extend MacroFX for real teams: building custom macros, testing pipelines, and codifying a metadata vocabulary that scales across services.

## Step 1: Ship a Custom Macro

Custom macros let you translate domain concepts into typed helpers. Below we add lightweight request tracing that attaches a span object to the context.

```ts
import { defineMacro, type MacroContext } from "macrofx";

type TraceMeta = { trace?: true };

type TraceContext = {
  span?: { id: string; start: number; end: () => void };
};

export const traceMacro = defineMacro<"trace", TraceMeta, TraceContext>(
  async (next, ctx, meta) => {
    if (!meta.trace) return next(ctx);

    const span = {
      id: crypto.randomUUID(),
      start: Date.now(),
      end: () => console.log("span finished"),
    };

    try {
      return await next({ ...ctx, span });
    } finally {
      span.end();
    }
  },
);
```

Add `traceMacro` to your pipeline’s macro array and steps that include `meta: { trace: true }` gain a typed `span` helper without touching business logic. Because macros share a consistent signature, you can stage more advanced tracing backends later without changing call sites.

## Step 2: Harden the Pipeline with Tests

MacroFX encourages pure handlers, which makes end-to-end tests straightforward. Combine built-in macros with your new `trace` capability and lean on Deno’s test runner.

```ts
import { assertEquals } from "std/testing/asserts.ts";
import { cacheMacro, envMacro, retryMacro } from "macrofx";
import { traceMacro } from "./trace.ts";

const macros = [envMacro, cacheMacro, retryMacro, traceMacro] as const;
const pipeline = createPipeline<Meta, {}, typeof macros>(macros, () => ({}));

type Meta = {
  env?: string[];
  cacheKey?: string;
  retry?: { times: number; delayMs: number };
  trace?: true;
};

Deno.test("fetchQuote uses env and tracing", async () => {
  Deno.env.set("QUOTE_API_URL", "https://example.test");
  Deno.env.set("QUOTE_API_KEY", "secret");

  const step = {
    name: "fetch-quote",
    meta: {
      env: ["QUOTE_API_URL", "QUOTE_API_KEY"],
      trace: true,
    },
    run: ({ env, span }) => {
      assertEquals(typeof span?.id, "string");
      return `${env.QUOTE_API_URL}/${env.QUOTE_API_KEY}`;
    },
  } satisfies Step<Meta, {}, typeof macros, string>;

  const result = await pipeline.execute(step);
  assertEquals(result, "https://example.test/secret");
});
```

Because the metadata expresses dependencies, the test only needs to set expected env vars. MacroFX orchestrates the rest—validation, context assembly, teardown.

## Step 3: Curate a Metadata Vocabulary

As teams grow, inconsistency sneaks in. One service might use `meta: { cacheKey: ... }`, another `meta: { cache: ... }`. Establish a shared, documented vocabulary so metadata remains self-descriptive.

- **Define types in a central module** (e.g. `types/meta.ts`) and re-export from your SDK package.
- **Annotate each field** with a short JSDoc block describing intent, defaults, and interactions with other macros.
- **Lint for drift** by adding a lightweight schema check in CI. Reject steps that reference unknown metadata keys.

An example snippet for the type definition:

```ts
export type StandardMeta = {
  env?: readonly string[];
  cacheKey?: string;
  retry?: { times: number; delayMs?: number; jitter?: boolean };
  timeoutMs?: number;
  trace?: true;
};
```

Codifying these keys ensures your pipeline stays discoverable and your IDE tooling can surface accurate hints.

## Putting It All Together

When you combine the three steps, your codebase gains a sustainable pattern:

1. **Capabilities stay declarative** thanks to macro metadata.
2. **Context remains type-safe** because TypeScript infers the shape from shared types.
3. **Runtime behavior evolves** simply by swapping or extending macros; handlers remain untouched.

MacroFX becomes more than a convenience—it turns cross-cutting concerns into a maintainable contract between infrastructure and product code. Keep pushing the boundaries with more macros (feature flags, metrics, circuit breakers) and the same pattern will keep your business logic clean.
