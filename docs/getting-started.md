# Getting Started with MacroFX

This guide will take you from zero to building production-ready pipelines with macrofx in 15 minutes.

## What is MacroFX?

MacroFX is a **metadata-driven capability injection system** for TypeScript/Deno. Instead of writing boilerplate for cross-cutting concerns (auth, caching, retries, validation), you declare what you need via metadata and let macros provide it with full type safety.

## Prerequisites

- Deno 1.40+ (or Node.js 18+ with import maps)
- Basic TypeScript knowledge
- Familiarity with async/await

## Installation

### Deno (recommended)

```typescript
import { createPipeline, envMacro, cacheMacro } from "https://deno.land/x/macrofx/mod.ts";
```

### Node/Bun

```bash
npm install macrofx  # Coming soon
```

## Your First Pipeline (3 minutes)

Let's build a simple weather fetcher that uses environment variables:

```typescript
import {
  createPipeline,
  envMacro,
  type Empty,
  type Step,
} from "https://deno.land/x/macrofx/mod.ts";

type Meta = {
  env?: string[];
};

const macros = [envMacro] as const;

const { execute } = createPipeline<Meta, Empty, typeof macros>(
  macros,
  () => ({}),
);

const fetchWeather: Step<Meta, Empty, typeof macros, string> = {
  name: "fetch-weather",
  meta: {
    env: ["WEATHER_API_KEY"],
  },
  run: async ({ env }) => {
    const response = await fetch(
      `https://api.weather.com/today?key=${env.WEATHER_API_KEY}`,
    );
    return response.text();
  },
};

Deno.env.set("WEATHER_API_KEY", "your-key-here");
const weather = await execute(fetchWeather);
console.log(weather);
```

**What just happened?**

1. You declared `env: ["WEATHER_API_KEY"]` in metadata
2. `envMacro` validated the env var exists and injected it into `ctx.env`
3. TypeScript knew `env.WEATHER_API_KEY` exists at compile time
4. Your `run` function stayed pure - no manual env checking!

## Adding Caching (5 minutes)

Let's avoid hitting the API every time:

```typescript
import { cacheMacro, type CacheMeta } from "https://deno.land/x/macrofx/mod.ts";

type Meta = {
  env?: string[];
  cacheKey?: string;
  cacheTTL?: number;
};

const macros = [envMacro, cacheMacro] as const;

const { execute } = createPipeline<Meta, Empty, typeof macros>(
  macros,
  () => ({}),
);

const fetchWeather: Step<Meta, Empty, typeof macros, string> = {
  name: "fetch-weather",
  meta: {
    env: ["WEATHER_API_KEY"],
    cacheKey: "weather:today",
    cacheTTL: 300_000, // 5 minutes
  },
  run: async ({ env }) => {
    console.log("Fetching from API...");
    const response = await fetch(
      `https://api.weather.com/today?key=${env.WEATHER_API_KEY}`,
    );
    return response.text();
  },
};

console.log(await execute(fetchWeather)); // Fetches from API
console.log(await execute(fetchWeather)); // Returns cached (instant!)
```

**What changed?**

1. Added `cacheMacro` to the macro array
2. Declared `cacheKey` and `cacheTTL` in metadata
3. First call fetches, second call returns cached result
4. Cache automatically expires after 5 minutes

## Adding Resilience (7 minutes)

APIs fail. Let's add retries and timeouts:

```typescript
import {
  retryMacro,
  type RetryMeta,
  timeoutMacro,
  type TimeoutMeta,
} from "https://deno.land/x/macrofx/mod.ts";

type Meta = {
  env?: string[];
  cacheKey?: string;
  cacheTTL?: number;
  retry?: { times: number; delayMs: number };
  timeoutMs?: number;
};

const macros = [envMacro, cacheMacro, retryMacro, timeoutMacro] as const;

const { execute } = createPipeline<Meta, Empty, typeof macros>(
  macros,
  () => ({}),
);

const fetchWeather: Step<Meta, Empty, typeof macros, string> = {
  name: "fetch-weather",
  meta: {
    env: ["WEATHER_API_KEY"],
    cacheKey: "weather:today",
    cacheTTL: 300_000,
    retry: { times: 3, delayMs: 500 },
    timeoutMs: 5000,
  },
  run: async ({ env }) => {
    const response = await fetch(
      `https://api.weather.com/today?key=${env.WEATHER_API_KEY}`,
    );
    if (!response.ok) throw new Error("API failed");
    return response.text();
  },
};

const weather = await execute(fetchWeather);
```

**What changed?**

1. Added `retryMacro` and `timeoutMacro`
2. Declared retry policy and timeout in metadata
3. Failures are automatically retried 3 times with 500ms delay
4. Execution aborts after 5 seconds total

## Organizing Macros (10 minutes)

As your app grows, organize macros into logical groups:

```typescript
import {
  composeMacros,
  mergeMacroSets,
  whenMacro,
} from "https://deno.land/x/macrofx/mod.ts";

const coreMacros = [envMacro, cacheMacro] as const;

const resilienceMacros = [retryMacro, timeoutMacro] as const;

const observabilityMacros = [
  createTelemetryMacro(),
  createLogMacro({ minLevel: "info" }),
] as const;

const productionMacros = mergeMacroSets(
  coreMacros,
  resilienceMacros,
  observabilityMacros,
);

const developmentMacros = mergeMacroSets(
  coreMacros,
  resilienceMacros,
);

const isDev = Deno.env.get("NODE_ENV") !== "production";
const macros = isDev ? developmentMacros : productionMacros;

const { execute } = createPipeline(macros, () => ({}));
```

**Best practices:**

- Group related macros by concern
- Use `mergeMacroSets()` to combine groups
- Environment-based macro selection
- Always use `as const` for type inference

## Conditional Macros (12 minutes)

Sometimes you want macros to activate conditionally:

```typescript
import { whenMacro, unlessMacro } from "https://deno.land/x/macrofx/mod.ts";

const featureFlags = new Set(["enable-cache"]);

const conditionalCacheMacro = whenMacro(
  (meta) => featureFlags.has("enable-cache"),
  cacheMacro,
);

const developmentOnlyLog = unlessMacro(
  (meta) => Deno.env.get("NODE_ENV") === "production",
  logMacro,
);

const macros = [
  envMacro,
  conditionalCacheMacro,
  developmentOnlyLog,
] as const;
```

**Use cases:**

- Feature flags (A/B testing)
- Environment-specific behavior
- Gradual rollouts
- Debug modes

## Your First Custom Macro (15 minutes)

Let's create a request ID tracking macro:

```typescript
import type { Macro } from "https://deno.land/x/macrofx/mod.ts";

type RequestIdMeta = {
  trackRequest?: boolean;
};

type RequestIdContext = {
  requestId: string;
};

const requestIdMacro: Macro<RequestIdMeta, {}, RequestIdContext> = {
  name: "requestId",
  match: (meta) => meta.trackRequest === true,
  resolve: () => ({
    requestId: crypto.randomUUID(),
  }),
  before: (ctx) => {
    console.log(`[${ctx.requestId}] Starting...`);
  },
  after: (ctx) => {
    console.log(`[${ctx.requestId}] Completed`);
  },
};

type Meta = RequestIdMeta & {
  env?: string[];
};

const macros = [envMacro, requestIdMacro] as const;

const step: Step<Meta, {}, typeof macros, string> = {
  name: "tracked-operation",
  meta: {
    trackRequest: true,
    env: ["API_KEY"],
  },
  run: ({ requestId, env }) => {
    console.log(`[${requestId}] Processing with ${env.API_KEY}`);
    return "done";
  },
};
```

**Macro anatomy:**

- `name` - Identifier for debugging
- `match` - Predicate to activate the macro
- `resolve` - Adds capabilities to context (runs once)
- `before` - Runs before the step (can short-circuit)
- `after` - Runs after the step (can transform result)
- `onError` - Handles errors (can recover)

## Next Steps

You now know the core concepts! Here's what to explore next:

### Intermediate

- [Composition Guide](./composition-guide.md) - Advanced patterns
- [Built-in macros](../README.md#built-in-macros) - Full reference
- [Use cases](../use-cases.md) - Real-world scenarios

### Advanced

- [Creating custom macros](../README.md#creating-custom-macros)
- [Testing strategies](./composition-guide.md#testing)
- [Performance tuning](./composition-guide.md#performance)
- [Multi-step pipelines](#) - Coming soon

### Examples

Run the examples to see patterns in action:

```bash
deno task cli         # CLI tools
deno task etl         # Data pipelines
deno task wf          # Workflows with auth
deno task composition # Composition patterns
```

## Common Patterns

### Environment-based Configuration

```typescript
const isProd = Deno.env.get("NODE_ENV") === "production";

const macros = mergeMacroSets(
  [envMacro],
  isProd ? [cacheMacro, telemetryMacro] : [logMacro],
);
```

### Feature Flags

```typescript
const featureFlagMacro = {
  name: "featureFlag",
  match: (m) => !!m.feature,
  before: (ctx, meta) => {
    if (!flags.has(meta.feature)) {
      return { skipped: true, reason: "feature disabled" };
    }
  },
};
```

### Telemetry

```typescript
import { createConsoleLogger, createTelemetryMacro } from "macrofx";

const logger = createConsoleLogger({ verbose: true });
const telemetry = createTelemetryMacro();

const step = {
  meta: { telemetry: logger },
  // ...
};

await execute(step);
console.log(logger.getEvents());
```

## Troubleshooting

### TypeScript errors about missing context properties

**Problem:** TypeScript says `ctx.env` doesn't exist

**Solution:** Make sure your metadata type includes the macro's meta type:

```typescript
type Meta = EnvMeta & CacheMeta;
```

### Metadata not activating macros

**Problem:** Macro isn't running even though metadata is set

**Solution:** Check the `match` function. It must return `true` for the macro to activate:

```typescript
match: (m) => !!m.cacheKey  // Make sure this returns true!
```

### Context properties undefined at runtime

**Problem:** `ctx.env` is `undefined` even though TypeScript is happy

**Solution:** Ensure the macro is in the macro array and the metadata matches:

```typescript
const macros = [envMacro] as const;  // envMacro must be included!
```

## FAQ

**Q: Do I need to use all built-in macros?**

A: No! Only add macros you actually use. Start with one or two.

**Q: Can I use macrofx with Express/Fastify/Hono?**

A: Yes! MacroFX is runtime-agnostic. Wrap your handlers with `execute()`.

**Q: How do I test steps with macros?**

A: Just execute them! Macros make testing easier because you control the environment via metadata.

**Q: What's the performance overhead?**

A: Minimal. The core is <100 lines. Macros only run when metadata matches.

**Q: Can I use macrofx in the browser?**

A: Yes! It's pure TypeScript with no dependencies.

## Summary

You've learned:

✅ Core concepts: pipelines, steps, metadata, macros
✅ Built-in macros: env, cache, retry, timeout
✅ Composition: merging and organizing macro sets
✅ Conditional activation: feature flags, environments
✅ Custom macros: building your own capabilities

**Next:** Check out the [Composition Guide](./composition-guide.md) for production patterns!