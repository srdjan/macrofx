# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**macrofx** is a lightweight functional programming engine for Deno that transforms metadata into typed capabilities via pluggable macros. It follows strict FP principles: no classes, no decorators, just functions, types, and combinators.

## Commands

### Development
```bash
deno task test      # Run all tests with -A permissions
deno task fmt       # Format code (2 spaces, 100 width, double quotes)
deno task lint      # Lint code with recommended rules
```

### Examples (all require -A permissions)
```bash
deno task cli       # Run CLI example with env, cache, retry, timeout macros
deno task etl       # Run ETL pipeline example
deno task wf        # Run workflow example with auth/role/transaction macros
deno task ui        # Run UI SSR tokenization example
deno task testing   # Run testing utilities example
```

## Architecture

### Core Pipeline Engine (`core.ts`)

The pipeline operates in distinct phases:
1. **validate** - All matching macros validate the metadata
2. **resolve** - Build typed capability context from macros (adds properties to context)
3. **before** - Guards/priming effects (can short-circuit by returning a value)
4. **run** - Execute the actual step function with typed context
5. **onError** - First macro returning a value handles the error
6. **after** - Transform/wrap results or add telemetry

Key types:
- `Macro<Meta, BaseCtx, AddedCtx>` - Defines a macro with lifecycle hooks
- `Step<Met, BaseCtx, Ms, Out>` - Defines an executable step with metadata
- `createPipeline()` - Creates a typed pipeline executor from macros array

The type system ensures that step handlers can only access context properties added by macros that match their metadata.

### Built-in Macros

All macros follow the pattern of matching metadata fields and optionally adding typed context:

- **env** (`env?: string[]`) - Resolves environment variables into `ctx.env` object
- **cache** (`cacheKey?: string`) - Simple in-memory cache with `ctx.cache` Map
- **retry** (`retry?: {times, delayMs}`) - Returns sentinel on error, use with `runWithRetry()`
- **timeout** (`timeoutMs?: number`) - Use with `timeoutWrapper()` helper
- **sink** (`sink?: boolean`) - Adds `ctx.sink` array for collecting outputs
- **schema** (`schema?: unknown`) - Toy validation, adds `ctx.validated` data

### Usage Pattern

1. Define metadata type as intersection of macro metas: `type Meta = EnvMeta & CacheMeta`
2. Create macro array with `as const` for type inference
3. Create pipeline with `createPipeline<Meta, Base, typeof macros>(macros, makeBase)`
4. Define steps with metadata that triggers desired macros
5. Execute steps - context is automatically typed based on metadata

## Code Style

- **Strict FP**: No classes, no inheritance, no decorators
- **Type-first**: Make illegal states unrepresentable
- **Pure core**: Side effects only at edges
- **Immutable data**: Prefer `readonly` and const
- **Small functions**: Single responsibility, composable
- **Explicit errors**: Return error values instead of throwing (except at boundaries)

## Testing

Tests use Deno's built-in test runner with standard assertions:
```bash
deno test -A              # Run all tests
deno test core_test.ts    # Run specific test file
```

Test files should demonstrate macro behavior and type safety guarantees.