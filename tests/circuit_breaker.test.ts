import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createCircuitBreaker } from "../lib/circuit_breaker.ts";

Deno.test("breaker: opens after threshold of failures", async () => {
  const br = createCircuitBreaker(2, 50);

  await assertRejects(() => br.wrap(async () => { throw new Error("x"); }));
  await assertRejects(() => br.wrap(async () => { throw new Error("x"); }));

  assertEquals(br.state(), "open");

  // While open, wrap should reject immediately
  await assertRejects(() => br.wrap(async () => 1));
});

Deno.test("breaker: half-open then closed after success", async () => {
  const br = createCircuitBreaker(1, 30);

  // Trigger open
  await assertRejects(() => br.wrap(async () => { throw new Error("x"); }));
  assertEquals(br.state(), "open");

  // Wait reset -> half_open
  await new Promise((r) => setTimeout(r, 35));

  // First probe succeeds -> closed
  const v = await br.wrap(async () => 123);
  assertEquals(v, 123);
  assertEquals(br.state(), "closed");
});
