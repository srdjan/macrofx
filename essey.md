## macrofx: A Type‑Safe Capability Injection Engine for Modern TypeScript

macrofx is a lightweight functional programming library that transforms how developers handle cross‑cutting concerns in TypeScript applications. At its core, it’s a metadata‑driven capability injection system that eliminates boilerplate while maintaining complete type safety—a rare combination in the JavaScript ecosystem.

### The Problem It Solves

Modern apps are plagued by repetitive patterns: caching logic scattered across modules, retry mechanisms copy‑pasted between services, environment variable handling duplicated everywhere, and authentication checks repeated in every endpoint. Traditional solutions like dependency injection frameworks or decorators often introduce complexity, runtime overhead, or break functional programming principles.

macrofx takes a different approach: declare what you need, and get exactly that—with full type inference.

### The Core Innovation

The library’s pipeline architecture runs every operation through six distinct phases:

1. Validate — type‑safe metadata validation
2. Resolve — build typed capability context
3. Before — guards and short‑circuiting logic
4. Run — your actual business logic
5. OnError — graceful error handling
6. After — result transformation and telemetry

What makes this powerful is the type system: macros that match your metadata automatically inject their capabilities into your execution context. Need caching? Add `cacheKey: "user:123"` to your metadata. Want retries? Include `retry: { times: 3, delayMs: 100 }`. The TypeScript compiler ensures you can only access capabilities that your metadata declares.

### Functional Programming at Scale

macrofx embraces pure functional principles:

- No classes or inheritance — just functions and types
- Immutable data — state changes via transformation, not mutation
- Effects at edges — side effects are contained in macro boundaries
- Composable abstractions — mix and match capabilities without coupling

This isn’t just philosophical purity—it’s practical. Pure functions are easier to test, debug, and reason about. The macro system provides the abstraction power of OOP without the complexity burden.

### Type Safety That Actually Works

Using advanced TypeScript features, macrofx achieves something rare: the compiler knows exactly what capabilities your code has access to based on metadata. Try to access a cache in a step without a `cacheKey`? Compile error. Forget to handle a retry scenario? The types guide you to the solution.

This doesn’t just catch bugs—it prevents entire classes of runtime errors from existing.

### Real‑World Impact

Consider an API endpoint that needs authentication, rate limiting, caching, and error handling. Traditional code might span 50+ lines with repetitive patterns. With macrofx:

```ts
const endpoint: Step<Meta, Base, Macros, Response> = {
  name: "get-user",
  meta: {
    auth: true,
    rateLimit: 100,
    cacheKey: "user:123",
    cacheTTL: 300_000,
  },
  run: ({ user, cache, rateLimit }) => ({
    id: user.id,
    name: user.name,
  }),
};
```

Ten lines. Fully typed. All cross‑cutting concerns handled declaratively.

### The Bigger Picture

macrofx represents a shift toward declarative capability composition. Instead of imperatively orchestrating dependencies, you declare what you need and let the type system and runtime handle the rest. This pattern scales beautifully—new capabilities integrate seamlessly without touching existing code.

The library shows that functional programming and excellent developer experience aren’t mutually exclusive. By leveraging TypeScript’s type system as a compile‑time capability injection mechanism, macrofx achieves the holy grail: code that’s both safe and simple.

In an ecosystem drowning in complexity, macrofx offers clarity. It’s not just another utility library—it’s a demonstration of what becomes possible when type safety and functional programming principles work in harmony. For teams building serious TypeScript applications, it’s a compelling glimpse into the future of how we compose and scale complex software systems.

