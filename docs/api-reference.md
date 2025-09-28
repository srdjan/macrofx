# MacroFX API Reference

Complete reference for all macrofx types, functions, and utilities.

## Core Types

### `Macro<Meta, BaseCtx, AddedCtx>`

Defines a macro that can inject capabilities into the execution context.

```typescript
type Macro<Meta, BaseCtx, AddedCtx> = {
  name: string;
  match: (meta: Meta) => boolean;
  validate?: (meta: Meta) => void;
  resolve?: (base: BaseCtx, meta: Meta) => Promise<AddedCtx> | AddedCtx;
  before?: (ctx: BaseCtx & AddedCtx, meta: Meta) => Promise<void | unknown> | void | unknown;
  after?: (ctx: BaseCtx & AddedCtx, meta: Meta, result: unknown) => unknown | void;
  onError?: (base: BaseCtx, meta: Meta, err: unknown) => unknown | void;
};
```

**Type Parameters:**
- `Meta` - Metadata type this macro recognizes
- `BaseCtx` - Base context type
- `AddedCtx` - Context properties this macro adds

**Properties:**

- **`name`** - Unique identifier for debugging and telemetry
- **`match(meta)`** - Returns `true` if this macro should activate for the given metadata
- **`validate(meta)`** - Optional validation, throws if metadata is invalid
- **`resolve(base, meta)`** - Creates capabilities to add to context (runs once per step)
- **`before(ctx, meta)`** - Runs before the step, can short-circuit by returning a value
- **`after(ctx, meta, result)`** - Runs after the step, can transform the result
- **`onError(base, meta, err)`** - Handles errors, first macro returning a value wins

### `Step<Met, BaseCtx, Ms, Out, SpecificMeta>`

Defines an executable step with metadata and a handler function.

```typescript
type Step<
  Met,
  BaseCtx,
  Ms extends readonly AnyMacro[],
  Out,
  SpecificMeta extends Met = Met,
> = {
  name: string;
  meta: SpecificMeta;
  run: StepFn<BaseCtx & AddedFrom<Ms, SpecificMeta>, Out>;
};
```

**Type Parameters:**
- `Met` - Union of all possible metadata types
- `BaseCtx` - Base context type
- `Ms` - Tuple of macros (usually `typeof macros`)
- `Out` - Return type of the `run` function
- `SpecificMeta` - Specific metadata for this step (subset of `Met`)

**Properties:**

- **`name`** - Step name for logging and debugging
- **`meta`** - Metadata object declaring required capabilities
- **`run(ctx)`** - Handler function with typed context based on metadata

### `StepFn<Ctx, Out>`

Type for step handler functions.

```typescript
type StepFn<Ctx, Out> = (ctx: Ctx) => Promise<Out> | Out;
```

Can be sync or async, returns the step result.

### `Empty`

Type alias for an empty object.

```typescript
type Empty = Record<PropertyKey, never>;
```

Useful as a base context when no shared context is needed.

## Core Functions

### `createPipeline<Met, BaseCtx, Ms>(macros, makeBase)`

Creates a pipeline executor from an array of macros.

```typescript
function createPipeline<Met extends object, BaseCtx, Ms extends readonly AnyMacro[]>(
  macros: Ms,
  makeBase: () => BaseCtx,
): { execute<Out, SpecificMeta extends Met>(step: Step<Met, BaseCtx, Ms, Out, SpecificMeta>): Promise<Out> }
```

**Parameters:**
- `macros` - Array of macros (use `as const` for type inference)
- `makeBase` - Factory function to create base context for each execution

**Returns:** Object with `execute` function

**Example:**

```typescript
const { execute } = createPipeline<Meta, Base, typeof macros>(
  macros,
  () => ({ requestId: crypto.randomUUID() })
);
```

## Built-in Macros

### Environment Variables

#### `envMacro`

Resolves and validates environment variables.

```typescript
type EnvMeta = {
  env?: readonly string[];
};

const envMacro: Macro<EnvMeta, Empty, { env: Record<string, string> }>;
```

**Context Added:** `ctx.env` - Object with environment variables as properties

**Example:**

```typescript
meta: { env: ["API_KEY", "DATABASE_URL"] }
run: ({ env }) => {
  console.log(env.API_KEY, env.DATABASE_URL);
}
```

### Caching

#### `cacheMacro`

In-memory cache with LRU eviction and TTL support.

```typescript
type CacheMeta = {
  cacheKey?: string;
  cacheTTL?: number;
};

const cacheMacro: Macro<CacheMeta, Empty, Empty>;
```

**Context Added:** None (works via `before`/`after` hooks)

**Features:**
- LRU eviction when cache reaches 1000 entries
- Optional TTL per cache entry
- Automatic expiry cleanup

**Example:**

```typescript
meta: { cacheKey: "user:123", cacheTTL: 60_000 }
```

**Utilities:**

```typescript
function clearCache(): void;
function getCacheStats(): {
  size: number;
  maxSize: number;
  entries: Array<{ key: string; accessCount: number; hasExpiry: boolean }>;
};
```

### Retry

#### `retryMacro`

Enables automatic retry with configurable delay.

```typescript
type RetryMeta = {
  retry?: { times: number; delayMs: number };
};

const retryMacro: Macro<RetryMeta, Empty, Empty>;
```

**Note:** This macro returns a sentinel on error. Use with helper:

```typescript
import { retryFromMeta } from "macrofx";

const withRetry = retryFromMeta(meta);
await withRetry(() => doWork());
```

### Timeout

#### `timeoutMacro`

Enforces execution time limits.

```typescript
type TimeoutMeta = {
  timeoutMs?: number;
};

const timeoutMacro: Macro<TimeoutMeta, Empty, Empty>;
```

**Note:** Use with helper:

```typescript
import { timeoutFromMeta } from "macrofx";

const withTimeout = timeoutFromMeta(meta, "operation-name");
await withTimeout(() => doWork());
```

### Sink (Event Collection)

#### `sinkMacro`

Collects emitted events to console or memory.

```typescript
type SinkMeta = {
  sink?: "console" | "memory";
};

const sinkMacro: Macro<SinkMeta, Empty, { emit: (event: unknown) => void }>;
```

**Context Added:** `ctx.emit()` - Function to emit events

**Example:**

```typescript
meta: { sink: "memory" }
run: ({ emit }) => {
  emit({ type: "started", timestamp: Date.now() });
  emit({ type: "completed" });
}
```

**Utilities:**

```typescript
function clearMemSink(): void;
function getMemSinkEvents(): readonly unknown[];
```

### Schema Validation

#### `schemaMacro` (backward compatible)

Simple Person array validation for examples.

```typescript
type SchemaMeta = { schema?: "Person[]" };

const schemaMacro: Macro<SchemaMeta, Empty, { data: Person[] }>;
```

#### `createSchemaMacro<T>()` (generic)

Creates a typed schema validation macro.

```typescript
type SchemaMeta<T> = {
  schema?: {
    name: string;
    validator: SchemaValidator<T>;
    fetch?: () => Promise<unknown> | unknown;
    transform?: (data: T) => unknown;
  };
};

function createSchemaMacro<T>(): Macro<SchemaMeta<T>, Empty, SchemaAdded<T>>;
```

**Context Added:** `ctx.data` - Validated data of type `T`, `ctx.schemaName` - Schema name

**Example:**

```typescript
const userSchemaMacro = createSchemaMacro<User>();

meta: {
  schema: {
    name: "user",
    validator: userValidator,
    fetch: () => fetchUserData(),
  }
}
run: ({ data }) => {
  console.log(data.id, data.name);
}
```

**Validator Interface:**

```typescript
type SchemaValidator<T> = {
  validate: (data: unknown) => data is T;
  parse?: (data: unknown) => T;
};
```

## Composition Utilities

### Merging Macro Sets

#### `composeMacros<M1, M2>(macros1, macros2)`

Merges two macro sets with full type inference.

```typescript
function composeMacros<M1 extends readonly unknown[], M2 extends readonly unknown[]>(
  macros1: M1,
  macros2: M2,
): [...M1, ...M2];
```

**Example:**

```typescript
const allMacros = composeMacros(coreMacros, observabilityMacros);
```

#### `mergeMacroSets<T>(...macroSets)`

Merges multiple macro sets into one.

```typescript
function mergeMacroSets<const T extends readonly (readonly unknown[])[]>(
  ...macroSets: T
): readonly (T[number] extends readonly (infer U)[] ? U : never)[];
```

**Example:**

```typescript
const allMacros = mergeMacroSets(
  coreMacros,
  resilienceMacros,
  observabilityMacros
);
```

### Conditional Activation

#### `whenMacro<Meta, BaseCtx, AddedCtx>(condition, macro)`

Activates a macro only when condition returns `true`.

```typescript
function whenMacro<Meta, BaseCtx, AddedCtx>(
  condition: (meta: Meta) => boolean,
  macro: Macro<Meta, BaseCtx, AddedCtx>,
): Macro<Meta, BaseCtx, AddedCtx>;
```

**Example:**

```typescript
const prodOnlyCache = whenMacro(
  (meta) => Deno.env.get("NODE_ENV") === "production",
  cacheMacro
);
```

#### `unlessMacro<Meta, BaseCtx, AddedCtx>(condition, macro)`

Activates a macro unless condition returns `true` (inverse of `whenMacro`).

```typescript
function unlessMacro<Meta, BaseCtx, AddedCtx>(
  condition: (meta: Meta) => boolean,
  macro: Macro<Meta, BaseCtx, AddedCtx>,
): Macro<Meta, BaseCtx, AddedCtx>;
```

#### `alwaysMacro<Meta, BaseCtx, AddedCtx>(macro)`

Makes a macro always match (useful for macros without a `match` function).

```typescript
function alwaysMacro<Meta, BaseCtx, AddedCtx>(
  macro: Omit<Macro<Meta, BaseCtx, AddedCtx>, "match">,
): Macro<Meta, BaseCtx, AddedCtx>;
```

#### `neverMacro<Meta, BaseCtx, AddedCtx>(macro)`

Disables a macro completely (for debugging).

```typescript
function neverMacro<Meta, BaseCtx, AddedCtx>(
  macro: Macro<Meta, BaseCtx, AddedCtx>,
): Macro<Meta, BaseCtx, AddedCtx>;
```

### Parameterized Macros

#### `createMacroFactory<Meta, BaseCtx, AddedCtx, Config>(factory)`

Creates a reusable macro factory that accepts configuration.

```typescript
type MacroFactory<Meta, BaseCtx, AddedCtx, Config = void> =
  Config extends void
    ? () => Macro<Meta, BaseCtx, AddedCtx>
    : (config: Config) => Macro<Meta, BaseCtx, AddedCtx>;

function createMacroFactory<Meta, BaseCtx, AddedCtx, Config = void>(
  factory: (config: Config) => Macro<Meta, BaseCtx, AddedCtx>,
): MacroFactory<Meta, BaseCtx, AddedCtx, Config>;
```

**Example:**

```typescript
const createLogMacro = createMacroFactory((config: { level: string }) => ({
  name: "log",
  match: (m) => !!m.log,
  before: (ctx, meta) => console.log(`[${config.level}] Starting...`),
}));

const debugLog = createLogMacro({ level: "DEBUG" });
const infoLog = createLogMacro({ level: "INFO" });
```

#### `withDefaults<Meta, BaseCtx, AddedCtx, Config>(factory, defaults)`

Wraps a factory with default configuration.

```typescript
function withDefaults<Meta, BaseCtx, AddedCtx, Config extends Record<string, unknown>>(
  factory: (config: Config) => Macro<Meta, BaseCtx, AddedCtx>,
  defaults: Config,
): (config?: Partial<Config>) => Macro<Meta, BaseCtx, AddedCtx>;
```

**Example:**

```typescript
const createTimeoutMacro = withDefaults(
  (config: { timeoutMs: number; label: string }) => ({ /* ... */ }),
  { timeoutMs: 5000, label: "timeout" }
);

const fastTimeout = createTimeoutMacro({ timeoutMs: 1000 });
const defaultTimeout = createTimeoutMacro();
```

#### `extendMacro<Meta, BaseCtx, AddedCtx>(macro, extension)`

Extends an existing macro with additional behavior.

```typescript
function extendMacro<Meta, BaseCtx, AddedCtx>(
  macro: Macro<Meta, BaseCtx, AddedCtx>,
  extension: Partial<Macro<Meta, BaseCtx, AddedCtx>>,
): Macro<Meta, BaseCtx, AddedCtx>;
```

**Example:**

```typescript
const loggingCacheMacro = extendMacro(cacheMacro, {
  after: (ctx, meta, result) => {
    console.log(`Cached: ${meta.cacheKey}`);
    return result;
  },
});
```

#### `renameMacro<Meta, BaseCtx, AddedCtx>(macro, newName)`

Changes a macro's name (useful for debugging).

```typescript
function renameMacro<Meta, BaseCtx, AddedCtx>(
  macro: Macro<Meta, BaseCtx, AddedCtx>,
  newName: string,
): Macro<Meta, BaseCtx, AddedCtx>;
```

## Telemetry

### Event Types

```typescript
type TelemetryEvent =
  | { type: "step:start"; stepName: string; timestamp: number }
  | { type: "step:end"; stepName: string; timestamp: number; durationMs: number }
  | { type: "step:error"; stepName: string; timestamp: number; error: unknown }
  | { type: "macro:resolve"; macroName: string; stepName: string; timestamp: number }
  | { type: "macro:before"; macroName: string; stepName: string; timestamp: number }
  | { type: "macro:after"; macroName: string; stepName: string; timestamp: number }
  | { type: "macro:error"; macroName: string; stepName: string; timestamp: number; error: unknown };
```

### Telemetry Collector

#### `createTelemetryCollector()`

Creates an event collector for custom telemetry.

```typescript
type TelemetryCollector = {
  emit: (event: TelemetryEvent) => void;
  getEvents: () => readonly TelemetryEvent[];
  clear: () => void;
};

function createTelemetryCollector(): TelemetryCollector;
```

#### `createTelemetryMacro<Meta, BaseCtx>()`

Creates a macro that adds telemetry to steps.

```typescript
type TelemetryMeta = {
  telemetry?: boolean | TelemetryCollector;
};

function createTelemetryMacro<Meta extends TelemetryMeta, BaseCtx>(): Macro<
  Meta,
  BaseCtx,
  { telemetry: TelemetryCollector }
>;
```

**Example:**

```typescript
const telemetryMacro = createTelemetryMacro();

meta: { telemetry: true }
run: ({ telemetry }) => {
  const events = telemetry.getEvents();
  console.log(`Collected ${events.length} events`);
}
```

#### `createConsoleLogger(config?)`

Creates a telemetry collector that logs to console.

```typescript
type ConsoleLoggerConfig = {
  prefix?: string;
  colors?: boolean;
  verbose?: boolean;
};

function createConsoleLogger(config?: ConsoleLoggerConfig): TelemetryCollector;
```

**Example:**

```typescript
const logger = createConsoleLogger({
  prefix: "[my-app]",
  colors: true,
  verbose: false,
});

meta: { telemetry: logger }
```

## Result Type

Functional error handling utilities.

### Types

```typescript
type Ok<T> = { readonly ok: true; readonly value: T };
type Err<E> = { readonly ok: false; readonly error: E };
type Result<T, E> = Ok<T> | Err<E>;
```

### Constructors

```typescript
function ok<T>(value: T): Ok<T>;
function err<E>(error: E): Err<E>;
```

### Type Guards

```typescript
function isOk<T, E>(result: Result<T, E>): result is Ok<T>;
function isErr<T, E>(result: Result<T, E>): result is Err<E>;
```

### Transformations

```typescript
function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E>;
function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F>;
function flatMap<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E>;
```

### Unwrapping

```typescript
function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T;
function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T;
```

### Async

```typescript
function mapAsync<T, U, E>(result: Result<T, E>, fn: (value: T) => Promise<U>): Promise<Result<U, E>>;
function flatMapAsync<T, U, E>(result: Result<T, E>, fn: (value: T) => Promise<Result<U, E>>): Promise<Result<U, E>>;
```

### Utilities

```typescript
function all<T, E>(results: readonly Result<T, E>[]): Result<readonly T[], E>;
function tryCatch<T, E = Error>(fn: () => T, mapError?: (error: unknown) => E): Result<T, E>;
function tryCatchAsync<T, E = Error>(fn: () => Promise<T>, mapError?: (error: unknown) => E): Promise<Result<T, E>>;
```

## Helper Functions

### `sleep(ms)`

```typescript
function sleep(ms: number): Promise<void>;
```

### `withTimeout<T>(promise, ms, label?)`

```typescript
function withTimeout<T>(p: Promise<T>, ms: number, label?: string): Promise<T>;
```

### `compose<A>(...fns)`

```typescript
function compose<A>(...fs: Array<(a: A) => A>): (a: A) => A;
```

## Type Utilities

### `AddedFrom<Ms, Met>`

Computes the union of all context properties added by macros that match the given metadata.

```typescript
type AddedFrom<Ms extends readonly AnyMacro[], Met>;
```

Used internally by `Step` to type the context parameter.

---

**See Also:**
- [Getting Started Guide](./getting-started.md)
- [Composition Guide](./composition-guide.md)
- [Examples](../examples/)