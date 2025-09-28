# MacroFX Meta Capabilities, Part 1: Declarative Power Without Boilerplate

MacroFX is built around a simple idea: describe the capabilities your code needs, let the runtime assemble them, and keep your business logic clean. In Part 1 we explore how metadata-driven macros remove the glue work from TypeScript and Deno projects. Inspired by 

## Why Metadata?

Every non-trivial service repeats the same plumbing—loading environment variables, wrapping retries, managing caches, enforcing auth. We usually hand-write defensive code around each handler, which leads to duplicated logic and brittle tests. MacroFX treats those cross-cutting concerns as declarative metadata so the runtime can inject exactly what a step asks for.

## How the Flow Works

1. **Define your metadata type** to constrain which capabilities a step can declare.
2. **Register macros** with `createPipeline`. Each macro inspects metadata and augments the execution context.
3. **Author steps** that focus on business logic while declaring a `meta` object inline.
4. **Execute steps** with `pipeline.execute(step)`. MacroFX orchestrates setup/teardown in the right order and hands `run` a fully typed context.

## A Complete Example

```ts
import {
  cacheMacro,
  createPipeline,
  envMacro,
  retryMacro,
  type Step,
} from "https://deno.land/x/macrofx/mod.ts";

type Meta = {
  env?: string[];
  cacheKey?: string;
  retry?: { times: number; delayMs: number };
};

const macros = [envMacro, cacheMacro, retryMacro] as const;
const pipeline = createPipeline<Meta, {}, typeof macros>(macros, () => ({}));

const fetchQuote: Step<Meta, {}, typeof macros, string> = {
  name: "fetch-quote",
  meta: {
    env: ["QUOTE_API_URL", "QUOTE_API_KEY"],
    cacheKey: "quote:motd",
    retry: { times: 3, delayMs: 250 },
  },
  run: async ({ env }) => {
    const res = await fetch(`${env.QUOTE_API_URL}/motd`, {
      headers: { "X-API-Key": env.QUOTE_API_KEY },
    });
    if (!res.ok) throw new Error("Failed to fetch quote");
    return res.text();
  },
};

const quote = await pipeline.execute(fetchQuote);
```

When `pipeline.execute` runs, MacroFX validates environment variables, wraps the handler with retries, checks the cache, and injects a typed `env` object. Your `run` function remains a single-responsibility unit.

## What You Get for Free

- **Type-safe context**: TypeScript knows `env.QUOTE_API_KEY` exists because your metadata says so.
- **Composable capabilities**: Mix built-ins such as `env`, `cache`, `retry`, `timeout`, `sink`, and `schema`, or register custom macros.
- **Runtime agnostic**: The pattern works equally well for HTTP handlers, background jobs, CLIs, and tests.
- **Minimal boilerplate**: Cross-cutting concerns live next to the definition, not inside the imperative body of your handler.

## Looking Ahead

In Part 2 we will expand on three practical next steps:

- Crafting a custom macro to expose domain-specific helpers.
- Hardening a pipeline with tracing, tests, and fallbacks.
- Establishing a shared metadata vocabulary so teams stay aligned.

Read on when you are ready to turn the declarative pattern into a full production toolkit.
