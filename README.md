# macrofx

**Type-safe, metadata-driven capability injection for TypeScript/Deno.**

Stop writing boilerplate. Let metadata drive your cross-cutting concerns while TypeScript ensures everything is type-safe.

## The Problem

Every non-trivial application needs the same capabilities: environment config, caching, retries, auth, validation, transactions. You end up either:

- **Coupling everything** - Business logic tangled with infrastructure
- **Framework lock-in** - Your code only works with Express/Fastify/Hono/Fresh
- **Type unsafety** - Context objects with `any` types everywhere
- **Boilerplate explosion** - Same patterns copy-pasted across handlers

## The Solution: Metadata-Driven Macros

Note: The following example mixes built-in and custom macros (auth/role/tx/schema).
Built-ins provided by macrofx are env, cache, retry, timeout, sink, and schema.
You can define others as shown in “Creating Custom Macros.”

```typescript
// Your business logic stays pure - just declare what you need via metadata
const processPayment: Step<Meta, Base, typeof macros, Result> = {
  name: "process-payment",
  meta: {
    auth: true, // ✅ Adds typed `ctx.user`
    role: "admin", // ✅ Enforces role check
    schema: PaymentSchema, // ✅ Validates input
    tx: "rw", // ✅ Wraps in transaction
    retry: { times: 3 }, // ✅ Auto-retry on failure
    cacheKey: "payment:v1", // ✅ Caches result
  },
  run: ({ user, validated, tx }) => {
    // TypeScript knows EXACTLY what's available based on metadata!
    // user: User, validated: Payment, tx: Transaction
    return processWithTx(user, validated, tx);
  },
};
```

## Key Benefits

### 🎯 **Type-Safe Context Injection**

Your handler context is automatically typed based on metadata. No more `ctx: any`.

### 🔄 **Composable & Reusable**

Mix and match macros. Create your own. Share across projects.

### 🏗️ **Clean Architecture**

Pure business logic. Effects at edges. Testable by design.

### 🚀 **Runtime Agnostic**

Same patterns work for:

- HTTP servers (any framework)
- CLI tools
- ETL pipelines
- Workflow orchestration
- Test fixtures
- SSR/UI tokenization

### 📦 **Zero Dependencies**

Pure TypeScript. Runs on Deno, Node, Bun, or browsers.

## Real-World Use Cases

### API Endpoint with Auth, Validation, and Caching

```typescript
const getUser: Step<Meta, Base, typeof macros, User> = {
  name: "get-user",
  meta: {
    auth: true,
    role: "member",
    cacheKey: "user:${id}",
    timeoutMs: 5000,
  },
  run: ({ user, params }) => fetchUserData(params.id),
};
```

Note: `window` is a custom macro defined inline in the example; `sink` uses the built-in sinkMacro.

### ETL Pipeline with Custom Windowing and Metrics

```typescript
const aggregateMetrics: Step<Meta, Base, typeof macros, Metrics> = {
  name: "aggregate",
  meta: {
    window: { size: 100 },
    sink: "console",
    retry: { times: 5, delayMs: 1000 },
  },
  run: ({ window, emit, data }) => {
    const metrics = calculate(data, window);
    emit(metrics);
    return metrics;
  },
};
```

### CLI Tool with Environment Config

```typescript
const deploy: Step<Meta, Base, typeof macros, void> = {
  name: "deploy",
  meta: {
    env: ["API_KEY", "REGION"],
    timeoutMs: 30_000,
  },
  run: ({ env }) => deployToCloud(env.API_KEY, env.REGION),
};
```

### Test with Deterministic Fixtures

```typescript
const simulateGame: Step<Meta, Base, typeof macros, Score> = {
  name: "simulate",
  meta: {
    fakeClock: 1_700_000_000,
    seed: 42, // Deterministic RNG
  },
  run: ({ now, random }) => runSimulation(now(), random),
};
```

## Quick Start

### Install

```bash
# Deno (recommended)
import { createPipeline } from 'https://deno.land/x/macrofx/mod.ts'

# Node/Bun (coming soon)
npm install macrofx
```

### Basic Example

```typescript
import {
  cacheMacro,
  createPipeline,
  type Empty,
  envMacro,
  type Step,
} from "https://deno.land/x/macrofx/mod.ts";

// 1. Define your metadata type (what capabilities you want)
type Meta = { env?: string[]; cacheKey?: string };

// 2. Setup your macro pipeline
const macros = [envMacro, cacheMacro] as const;
const pipeline = createPipeline<Meta, Empty, typeof macros>(
  macros,
  () => ({}), // Base context factory
);

// 3. Create a step with metadata
const fetchWeather: Step<Meta, Empty, typeof macros, Weather> = {
  name: "fetch-weather",
  meta: {
    env: ["WEATHER_API_KEY"],
    cacheKey: "weather:today",
  },
  run: async ({ env }) => {
    // TypeScript knows env.WEATHER_API_KEY exists!
    const response = await fetch(`/weather?key=${env.WEATHER_API_KEY}`);
    return response.json();
  },
};

// 4. Execute (cache-aware, env-injected, fully typed)
const weather = await pipeline.execute(fetchWeather);
```

## Built-in Macros

| Macro          | Metadata                          | Provides              | Use Case               |
| -------------- | --------------------------------- | --------------------- | ---------------------- |
| `envMacro`     | `env: string[]`                   | `ctx.env` object      | Environment config     |
| `cacheMacro`   | `cacheKey: string`                | Result caching        | Expensive computations |
| `retryMacro`   | `retry: {times, delayMs}`         | Auto-retry logic      | Flaky operations       |
| `timeoutMacro` | `timeoutMs: number`               | Timeout wrapper       | Long-running tasks     |
| `sinkMacro`    | `sink: 'console' &#124; 'memory'` | `ctx.emit()` function | Event collection       |
| `schemaMacro`  | `schema: Schema`                  | `ctx.validated` data  | Input validation       |

Note: `retry` and `timeout` are applied via small helpers (see helpers.ts) rather than mutating your handler; check examples/cli.ts for usage.

## Creating Custom Macros

```typescript
// Example: Add request ID tracking
const requestIdMacro: Macro<{ trackRequest?: boolean }, {}, { requestId: string }> = {
  name: "requestId",
  match: (m) => m.trackRequest === true,
  resolve: () => ({ requestId: crypto.randomUUID() }),
  after: (ctx, meta, result) => {
    console.log(`[${ctx.requestId}] completed`);
    return result;
  },
};
```

## Architecture

```text
   Metadata                   Macros                    Typed Context
      ↓                         ↓                            ↓
{ auth: true }  →  authMacro.resolve()  →  ctx.user: User ✅
{ tx: 'rw' }    →  txMacro.resolve()    →  ctx.tx: Transaction ✅
{ cache: 'k1' } →  cacheMacro.before()   →  Returns cached result ✅
```

### Lifecycle Phases

1. **validate** - Check metadata correctness
2. **resolve** - Build capabilities (add to context)
3. **before** - Guards, policies, cache checks
4. **run** - Your business logic with typed context
5. **onError** - Centralized error handling
6. **after** - Telemetry, transformation, cleanup

## Examples

Run the included examples:

```bash
deno task cli       # CLI with env, cache, retry
deno task etl       # ETL pipeline with windowing
deno task wf        # Workflow with auth and transactions
deno task ui        # SSR with theming and i18n
deno task testing   # Deterministic test fixtures
```

## Design Principles

- **No classes, no decorators** - Just functions and types
- **Metadata is data** - Not code, not strings, just objects
- **Type inference over annotation** - Let TypeScript do the work
- **Effects at edges** - Pure core, I/O at boundaries
- **Composition over configuration** - Small, focused macros
- **Runtime agnostic** - Not tied to any framework or platform

## License

MIT

---

**Ready to eliminate boilerplate?** Check out the [examples](./examples) or read the [core](./core.ts) (under 100 lines!).
