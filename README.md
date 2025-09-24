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

## See The Difference: Before & After macrofx

### ❌ Without macrofx - Boilerplate Everywhere
```typescript
// Typical Express/Node handler - boilerplate mixed with business logic
async function getProductHandler(req: Request, res: Response) {
  // Manual env checking
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing API_KEY" });
  }

  // Manual caching logic
  const cacheKey = `product:${req.params.id}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  // Manual retry logic
  let attempts = 0;
  let result;
  while (attempts < 3) {
    try {
      // Manual timeout wrapper
      result = await Promise.race([
        fetchProduct(req.params.id, apiKey),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 5000)
        )
      ]);
      break;
    } catch (err) {
      attempts++;
      if (attempts === 3) throw err;
      await sleep(1000);
    }
  }

  // Manual cache update
  cache.set(cacheKey, result);
  return res.json(result);
}
```

### ✅ With macrofx - Pure Business Logic
```typescript
// Same functionality, zero boilerplate
const getProduct: Step<Meta, Base, typeof macros, Product> = {
  name: "get-product",
  meta: {
    env: ["API_KEY"],
    cacheKey: "product:${id}",
    retry: { times: 3, delayMs: 1000 },
    timeoutMs: 5000
  },
  run: ({ env, params }) => fetchProduct(params.id, env.API_KEY)
  // That's it! All cross-cutting concerns handled automatically
}
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

### Step-by-Step Tutorial

Let's build a simple data fetcher with caching and retries to see how macrofx works:

```typescript
import {
  createPipeline,
  envMacro,
  cacheMacro,
  retryMacro,
  type Step
} from 'https://deno.land/x/macrofx/mod.ts'

// Step 1: Define what capabilities you might need
type MyMeta = {
  env?: string[]           // Environment variables
  cacheKey?: string         // Cache key for results
  retry?: { times: number, delayMs: number }  // Retry config
}

// Step 2: Choose your macros (order doesn't matter)
const myMacros = [envMacro, cacheMacro, retryMacro] as const

// Step 3: Create your pipeline
const pipeline = createPipeline<MyMeta, {}, typeof myMacros>(
  myMacros,
  () => ({})  // Empty base context
)

// Step 4: Write your business logic with metadata
const fetchUserProfile: Step<MyMeta, {}, typeof myMacros, UserProfile> = {
  name: 'fetch-user-profile',
  meta: {
    env: ['API_BASE_URL', 'API_KEY'],     // Need these env vars
    cacheKey: 'user:123',                  // Cache this result
    retry: { times: 3, delayMs: 500 }     // Retry on failure
  },
  run: async ({ env }) => {
    // TypeScript knows env.API_BASE_URL and env.API_KEY exist!
    const response = await fetch(
      `${env.API_BASE_URL}/users/123`,
      { headers: { 'X-API-Key': env.API_KEY } }
    )
    if (!response.ok) throw new Error('Failed to fetch')
    return response.json()
  }
}

// Step 5: Execute - everything just works!
const profile = await pipeline.execute(fetchUserProfile)
// ✅ Env vars validated and injected
// ✅ Result cached automatically
// ✅ Retries on failure with backoff
// ✅ TypeScript enforces everything!
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

## Practical Examples

### 🔐 Secure API Handler with Multiple Concerns
```typescript
// Combining auth, validation, rate limiting, and logging
const createOrder: Step<Meta, Base, typeof macros, Order> = {
  name: 'create-order',
  meta: {
    auth: true,                          // Verify JWT token
    role: 'customer',                     // Check user role
    rateLimit: { max: 10, window: 60 },  // 10 requests per minute
    schema: OrderSchema,                  // Validate input
    audit: true,                          // Log to audit trail
    tx: 'rw'                              // Database transaction
  },
  run: async ({ user, validated, tx }) => {
    // Just business logic - all security handled by macros!
    const order = await tx.orders.create({
      ...validated,
      userId: user.id,
      status: 'pending'
    })
    return order
  }
}
```

### 🔄 Data Processing Pipeline
```typescript
// ETL with batching, monitoring, and error recovery
const processRecords: Step<Meta, Base, typeof macros, ProcessResult> = {
  name: 'process-batch',
  meta: {
    batch: { size: 100 },                // Process in batches
    parallel: { workers: 4 },             // Parallel processing
    sink: 'metrics',                      // Send metrics
    dlq: 'failed-records',                // Dead letter queue
    retry: { times: 3, delayMs: 1000 }
  },
  run: async ({ batch, emit, parallel }) => {
    const results = await parallel.map(batch, async (record) => {
      const processed = await transform(record)
      emit({ type: 'processed', id: record.id })
      return processed
    })
    return { processed: results.length }
  }
}
```

### 🧪 Testing with Controlled Environment
```typescript
// Deterministic tests with fake timers and mocked services
const testPaymentFlow: Step<Meta, Base, typeof macros, TestResult> = {
  name: 'test-payment',
  meta: {
    fakeClock: Date.parse('2024-01-01'),  // Fixed time
    seed: 12345,                          // Deterministic random
    mock: {                                // Mock external services
      stripe: { charge: { success: true, id: 'ch_123' } },
      email: { send: { success: true } }
    }
  },
  run: async ({ now, random, mocks }) => {
    // Test runs exactly the same every time
    const orderId = `order_${random()}`
    const charge = await mocks.stripe.charge(100)
    await mocks.email.send('receipt')
    return { orderId, chargeId: charge.id, timestamp: now() }
  }
}
```

### 🌐 Multi-tenant SaaS Handler
```typescript
// Tenant isolation with automatic context switching
const getTenantData: Step<Meta, Base, typeof macros, TenantData> = {
  name: 'get-tenant-data',
  meta: {
    tenant: true,                         // Extract tenant from subdomain/header
    isolation: 'strict',                  // Enforce data boundaries
    cacheKey: 'tenant:${tenantId}:data',  // Per-tenant cache
    quota: { reads: 1000 }                // Rate limiting per tenant
  },
  run: async ({ tenant, db }) => {
    // Database automatically scoped to tenant!
    return await db.query('SELECT * FROM data WHERE tenant_id = ?', [tenant.id])
  }
}
```

### 🔥 Real-time Event Processing
```typescript
// WebSocket handler with automatic reconnection and buffering
const handleRealtimeEvent: Step<Meta, Base, typeof macros, void> = {
  name: 'realtime-handler',
  meta: {
    stream: 'events',                     // Subscribe to event stream
    buffer: { size: 1000, ttl: 60 },      // Buffer events
    reconnect: { times: 10, backoff: 'exponential' },
    transform: 'normalize'                // Data normalization
  },
  run: async ({ event, broadcast }) => {
    // Process event and broadcast to connected clients
    const normalized = normalizeEvent(event)
    await broadcast('updates', normalized)
  }
}
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

### Simple Example: Request ID Tracking
```typescript
// Add automatic request ID to any step
const requestIdMacro: Macro<{ trackRequest?: boolean }, {}, { requestId: string }> = {
  name: "requestId",
  match: (m) => m.trackRequest === true,
  resolve: () => ({ requestId: crypto.randomUUID() }),
  after: (ctx, meta, result) => {
    console.log(`[${ctx.requestId}] completed`);
    return result;
  },
};

// Use it in your steps
const myStep: Step<Meta, Base, typeof macros, Result> = {
  name: 'my-step',
  meta: { trackRequest: true },  // Enables request ID
  run: ({ requestId }) => {
    // requestId is available and typed!
    return doWork(requestId)
  }
}
```

### Advanced Example: Database Transaction Macro
```typescript
// Automatic database transaction handling
const txMacro: Macro<{ tx?: 'ro' | 'rw' }, { db: Database }, { tx: Transaction }> = {
  name: 'transaction',
  match: (m) => !!m.tx,
  resolve: async (base, meta) => {
    // Start transaction based on metadata
    const tx = await base.db.beginTransaction(meta.tx === 'rw')
    return { tx }
  },
  after: async (ctx, meta, result) => {
    // Auto-commit on success
    await ctx.tx.commit()
    return result
  },
  onError: async (base, meta, error) => {
    // Auto-rollback on error
    if (ctx.tx) await ctx.tx.rollback()
    throw error
  }
}
```

### Composition Example: Rate Limiting
```typescript
// Per-user rate limiting with Redis
const rateLimitMacro: Macro<
  { rateLimit?: { max: number, window: number } },
  { redis: Redis },
  {}
> = {
  name: 'rateLimit',
  match: (m) => !!m.rateLimit,
  before: async (ctx, meta) => {
    const key = `rate:${ctx.user?.id || ctx.ip}`
    const count = await ctx.redis.incr(key)

    if (count === 1) {
      await ctx.redis.expire(key, meta.rateLimit!.window)
    }

    if (count > meta.rateLimit!.max) {
      // Return early to skip handler execution
      return {
        error: 'Rate limit exceeded',
        retryAfter: meta.rateLimit!.window
      }
    }
  }
}
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
