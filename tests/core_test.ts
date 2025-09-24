import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createPipeline, type Empty, type Step } from "../mod.ts";

Deno.test("resolve adds typed capability", async () => {
  type Meta = { cap?: boolean };
  type Base = Empty;

  const capMacro = {
    name: "cap",
    match: (m: Meta) => m.cap === true,
    resolve: () => ({ capValue: 7 }),
  } as const;

  const { execute } = createPipeline<Meta, Base, readonly [typeof capMacro]>(
    [capMacro] as const,
    () => ({}),
  );

  const s: Step<Meta, Base, readonly [typeof capMacro], number> = {
    name: "s",
    meta: { cap: true },
    run: ({ capValue }) => capValue * 3,
  };

  const out = await execute(s);
  assertEquals(out, 21);
});

Deno.test("before short-circuits", async () => {
  type Meta = { deny?: boolean };
  type Base = Empty;

  const denyMacro = {
    name: "deny",
    match: (m: Meta) => !!m.deny,
    before: () => "blocked",
  } as const;
  const { execute } = createPipeline<Meta, Base, readonly [typeof denyMacro]>(
    [denyMacro] as const,
    () => ({}),
  );

  const out = await execute({ name: "x", meta: { deny: true }, run: () => "ok" });
  assert(out === "blocked");
});
