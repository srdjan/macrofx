/**
 * Example showcasing improved macrofx features:
 * - Enhanced cache with TTL and LRU eviction
 * - Result type for better error handling
 * - Generic schema validation
 * - Debug utilities
 */

import {
  createPipeline,
  type Empty,
  type Step,
  cacheMacro,
  type CacheMeta,
  getCacheStats,
  clearCache,
  type Result,
  ok,
  err,
  isOk,
  tryCatchAsync,
  createSchemaMacro,
  type SchemaValidator,
  type SchemaMeta,
} from "../mod.ts";

// Define a user type and validator
type User = { id: string; name: string; email: string; createdAt: Date };

const userValidator: SchemaValidator<User> = {
  validate: (data: unknown): data is User => {
    if (typeof data !== "object" || data === null) return false;
    const obj = data as Record<string, unknown>;
    return (
      typeof obj.id === "string" &&
      typeof obj.name === "string" &&
      typeof obj.email === "string" &&
      obj.createdAt instanceof Date
    );
  },
};

// Create a typed schema macro for users
const userSchemaMacro = createSchemaMacro<User>();

// Combine metadata types
type Meta = CacheMeta & SchemaMeta<User> & { rateLimit?: number };
type Base = { requestId: string };

// Custom rate limit macro
const rateLimitMacro = {
  name: "rateLimit",
  match: (m: Meta) => typeof m.rateLimit === "number",
  resolve: (_base: Base, meta: Meta) => {
    const requests = new Map<string, number[]>();
    return {
      checkRateLimit: (key: string): Result<void, string> => {
        const now = Date.now();
        const userRequests = requests.get(key) ?? [];
        const recentRequests = userRequests.filter(t => now - t < 60000); // Last minute

        if (recentRequests.length >= meta.rateLimit!) {
          return err(`Rate limit exceeded: ${recentRequests.length}/${meta.rateLimit}`);
        }

        recentRequests.push(now);
        requests.set(key, recentRequests);
        return ok(undefined);
      },
    };
  },
} as const;

// Set up pipeline
const macros = [cacheMacro, userSchemaMacro, rateLimitMacro] as const;
const { execute } = createPipeline<Meta, Base, typeof macros>(
  macros,
  () => ({ requestId: crypto.randomUUID() }),
);

// Example 1: Cached user fetching with TTL
type FetchUserMeta = {
  cacheKey: string;
  cacheTTL: number;
  schema: {
    name: string;
    validator: SchemaValidator<User>;
    fetch: () => Promise<unknown>;
  };
};

const fetchUser: Step<Meta, Base, typeof macros, User, FetchUserMeta> = {
  name: "fetch-user",
  meta: {
    cacheKey: "user:123",
    cacheTTL: 5000, // Cache for 5 seconds
    schema: {
      name: "user",
      validator: userValidator,
      fetch: async () => {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          id: "123",
          name: "Alice",
          email: "alice@example.com",
          createdAt: new Date(),
        };
      },
    },
  },
  run: ({ data }) => {
    console.log("✅ User loaded:", data.name);
    return data;
  },
};

// Example 2: Rate-limited operation
type RateLimitedMeta = { rateLimit: 5 };

const rateLimitedOp: Step<Meta, Base, typeof macros, Result<string, string>, RateLimitedMeta> = {
  name: "rate-limited",
  meta: { rateLimit: 5 },
  run: ({ checkRateLimit }) => {
    const result = checkRateLimit("user-123");
    if (isOk(result)) {
      return ok("Operation succeeded");
    }
    return result as Result<string, string>;
  },
};

// Example 3: Using Result type for error handling
async function demonstrateResultType() {
  console.log("\n📊 Result Type Demo:");

  const apiCall = await tryCatchAsync(
    async () => {
      const response = await fetch("https://jsonplaceholder.typicode.com/users/1");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    },
    (error) => `Failed to fetch: ${error}`,
  );

  if (isOk(apiCall)) {
    console.log("✅ API call succeeded:", apiCall.value.name);
  } else {
    console.log("❌ API call failed:", apiCall.error);
  }
}

// Main execution
async function main() {
  console.log("🚀 macrofx Improved Features Demo\n");

  // Clear any previous cache
  clearCache();

  // Example 1: Cached user fetching
  console.log("📦 Cache with TTL:");
  const user1 = await execute(fetchUser);
  console.log("First fetch took time (cache miss)");

  const user2 = await execute(fetchUser);
  console.log("Second fetch instant (cache hit)");

  // Show cache stats
  const stats = getCacheStats();
  console.log("Cache stats:", {
    size: stats.size,
    entries: stats.entries.map(e => ({
      key: e.key,
      hits: e.accessCount,
      expires: e.hasExpiry,
    })),
  });

  // Wait for cache to expire
  console.log("\nWaiting 5s for cache expiry...");
  await new Promise(resolve => setTimeout(resolve, 5100));

  const user3 = await execute(fetchUser);
  console.log("Third fetch took time (cache expired)");

  // Example 2: Rate limiting
  console.log("\n🚦 Rate Limiting:");
  for (let i = 0; i < 7; i++) {
    const result = await execute(rateLimitedOp);
    if (isOk(result)) {
      console.log(`Request ${i + 1}: ${result.value}`);
    } else {
      console.log(`Request ${i + 1}: ${result.error}`);
    }
  }

  // Example 3: Result type
  await demonstrateResultType();

  // Clean up
  clearCache();
  console.log("\n✅ Demo completed!");
}

if (import.meta.main) {
  main().catch(console.error);
}