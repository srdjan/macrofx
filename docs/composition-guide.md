# Macro Composition Guide

MacroFX provides powerful composition utilities to make your pipelines more flexible and maintainable. This guide covers the three main composition patterns: **merging macro sets**, **conditional activation**, and **parameterized macros**.

## Table of Contents

1. [Merging Macro Sets](#merging-macro-sets)
2. [Conditional Macro Activation](#conditional-macro-activation)
3. [Parameterized Macros](#parameterized-macros)
4. [Built-in Telemetry](#built-in-telemetry)
5. [Real-World Patterns](#real-world-patterns)

## Merging Macro Sets

When building larger applications, you'll want to organize macros into logical groups and compose them together.

### Basic Composition

```typescript
import { composeMacros, mergeMacroSets } from "macrofx";

const coreMacros = [envMacro, cacheMacro] as const;
const observabilityMacros = [logMacro, metricsMacro] as const;
const resilienceMacros = [retryMacro, timeoutMacro] as const;

const allMacros = mergeMacroSets(
  coreMacros,
  observabilityMacros,
  resilienceMacros
);

const { execute } = createPipeline(allMacros, makeBase);
```

### Two-Set Composition

For simpler cases with just two sets:

```typescript
const productionMacros = composeMacros(
  allMacros,
  [telemetryMacro, featureFlagMacro] as const
);
```

**Key Benefits:**
- Organize macros by concern (core, observability, resilience)
- Reuse macro sets across multiple pipelines
- Type-safe composition with full inference

## Conditional Macro Activation

Sometimes you want a macro to run only under certain conditions—for example, caching only when a feature flag is enabled.

### `whenMacro()`

Activate a macro only when a condition is met:

```typescript
import { whenMacro } from "macrofx";

const featureFlagStore = new Set(["new-algorithm"]);

const onlyWhenFeatureEnabled = whenMacro(
  (meta) => !meta.featureFlag || featureFlagStore.has(meta.featureFlag),
  cacheMacro
);
```

Now `cacheMacro` will only run if the feature flag check passes.

### `unlessMacro()`

The inverse—activate a macro unless a condition is true:

```typescript
const unlessInDevelopment = unlessMacro(
  (meta) => Deno.env.get("NODE_ENV") === "development",
  expensiveValidationMacro
);
```

### `alwaysMacro()`

Turn a macro without a `match` function into one that always runs:

```typescript
const metricsMacro = alwaysMacro({
  name: "metrics",
  resolve: () => ({
    recordMetric: (name: string, value: number) => {
      /* ... */
    },
  }),
});
```

### `neverMacro()`

Temporarily disable a macro without removing it from your code:

```typescript
const disabledMacro = neverMacro(expensiveDebugMacro);
```

**Key Benefits:**
- Environment-aware macro activation (dev vs production)
- Feature flag integration
- A/B testing support
- Easy macro disabling for debugging

## Parameterized Macros

Create reusable macro factories that accept configuration.

### Basic Factory

```typescript
import { createMacroFactory } from "macrofx";

const createLogMacro = createMacroFactory((config: { minLevel: LogLevel }) => ({
  name: "log",
  match: (m) => !!m.log,
  before: (_ctx, meta) => {
    if (shouldLog(meta.log, config.minLevel)) {
      console.log(`[${meta.log.toUpperCase()}] Step executing...`);
    }
  },
}));

const logMacroProduction = createLogMacro({ minLevel: "warn" });
const logMacroDevelopment = createLogMacro({ minLevel: "debug" });
```

### Default Parameters

Provide sensible defaults that users can override:

```typescript
import { withDefaults } from "macrofx";

const createTimeoutMacro = withDefaults(
  (config: { timeoutMs: number; label: string }) => ({
    name: config.label,
    match: (m) => !!m.timeout,
    // ...
  }),
  { timeoutMs: 5000, label: "timeout" }
);

const fastTimeout = createTimeoutMacro({ timeoutMs: 1000 });
const defaultTimeout = createTimeoutMacro();
```

### Extending Macros

Modify existing macros without rewriting them:

```typescript
import { extendMacro, renameMacro } from "macrofx";

const customCacheMacro = extendMacro(cacheMacro, {
  after: (ctx, meta, result) => {
    console.log(`Cached result for key: ${meta.cacheKey}`);
    return result;
  },
});

const renamedMacro = renameMacro(customCacheMacro, "custom-cache");
```

**Key Benefits:**
- DRY macro creation
- Environment-specific configuration
- Easy testing with different configs
- Gradual customization of built-in macros

## Built-in Telemetry

MacroFX includes observability tools to understand pipeline execution.

### Basic Telemetry

```typescript
import { createTelemetryMacro, createConsoleLogger } from "macrofx";

const logger = createConsoleLogger({ verbose: true });
const telemetryMacro = createTelemetryMacro();

const macros = [envMacro, cacheMacro, telemetryMacro] as const;
const { execute } = createPipeline(macros, makeBase);

const step: Step<Meta, Base, typeof macros, string> = {
  name: "fetch-data",
  meta: { telemetry: logger },
  run: () => "data",
};

await execute(step);

console.log("Events:", logger.getEvents());
```

### Custom Telemetry Collector

```typescript
import { createTelemetryCollector } from "macrofx";

const collector = createTelemetryCollector();

collector.emit({
  type: "step:start",
  stepName: "my-step",
  timestamp: Date.now(),
});

const events = collector.getEvents();
collector.clear();
```

### Console Logger Options

```typescript
const logger = createConsoleLogger({
  prefix: "[my-app]",
  colors: true,
  verbose: false, // Hide macro-level events
});
```

**Event Types:**
- `step:start`, `step:end`, `step:error`
- `macro:resolve`, `macro:before`, `macro:after`, `macro:error`

**Key Benefits:**
- Zero-config observability
- Performance profiling
- Debugging complex pipelines
- Integration with external monitoring tools

## Real-World Patterns

### Pattern 1: Environment-Based Configuration

```typescript
const isDevelopment = Deno.env.get("NODE_ENV") !== "production";

const logMacro = createLogMacro({
  minLevel: isDevelopment ? "debug" : "warn",
});

const cacheMacro = whenMacro(
  () => !isDevelopment,
  originalCacheMacro
);

const macros = mergeMacroSets(
  [envMacro, cacheMacro, logMacro],
  isDevelopment ? [telemetryMacro] : []
);
```

### Pattern 2: Feature Flag System

```typescript
const featureFlags = new Set<string>();

function loadFeatureFlags(userId: string) {
  // Load from DB or config service
}

const featureFlagMacro = {
  name: "featureFlag",
  match: (m) => !!m.featureFlag,
  before: (_ctx, meta) => {
    if (!featureFlags.has(meta.featureFlag)) {
      return { skipped: true, reason: "feature disabled" };
    }
  },
};
```

### Pattern 3: Shared Observability Stack

```typescript
const createObservabilityMacros = (serviceName: string) => {
  const logger = createConsoleLogger({ prefix: `[${serviceName}]` });
  const telemetry = createTelemetryMacro();
  const metrics = alwaysMacro(createMetricsMacro());

  return [telemetry, metrics] as const;
};

const userServiceMacros = mergeMacroSets(
  coreMacros,
  createObservabilityMacros("user-service")
);

const orderServiceMacros = mergeMacroSets(
  coreMacros,
  createObservabilityMacros("order-service")
);
```

### Pattern 4: Progressive Enhancement

Start simple, add complexity as needed:

```typescript
const v1Macros = [envMacro] as const;

const v2Macros = composeMacros(v1Macros, [cacheMacro] as const);

const v3Macros = composeMacros(v2Macros, [
  retryMacro,
  timeoutMacro,
  telemetryMacro,
] as const);
```

## Best Practices

1. **Organize by concern**: Group related macros into sets
2. **Use `as const`**: Enables full type inference
3. **Prefer composition**: Build complex behavior from simple pieces
4. **Test macro isolation**: Test each macro independently
5. **Document conditions**: Make `whenMacro` conditions clear
6. **Provide defaults**: Make parameterized macros easy to use
7. **Enable telemetry in dev**: Use `verbose: true` during development

## Type Safety

All composition utilities maintain full type safety:

```typescript
type Meta = EnvMeta & CacheMeta & LogMeta;

const macros = mergeMacroSets(coreMacros, observabilityMacros);

const step: Step<Meta, Base, typeof macros, string> = {
  name: "example",
  meta: {
    env: ["API_KEY"],
    cacheKey: "data",
    log: "info",
  },
  run: ({ env, cache }) => {
    return `${env.API_KEY}`;
  },
};
```

TypeScript knows:
- Which context properties are available
- Which metadata fields are valid
- Return type inference from `run()`

## Summary

MacroFX composition utilities enable:

- ✅ **Macro organization** via `composeMacros()` and `mergeMacroSets()`
- ✅ **Conditional logic** via `whenMacro()`, `unlessMacro()`, `alwaysMacro()`
- ✅ **Reusable factories** via `createMacroFactory()` and `withDefaults()`
- ✅ **Built-in observability** via telemetry collectors and console loggers
- ✅ **Full type safety** with TypeScript inference

These patterns scale from simple scripts to complex production systems while keeping code clean and testable.