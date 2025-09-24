import { createPipeline, type Step } from "../mod.ts";

type Meta = Record<never, never>;
type Base = { requestId: string };

const makeBase = (): Base => ({ requestId: `req-${Date.now()}` });
const macros = [] as const;
const { execute } = createPipeline<Meta, Base, typeof macros>(macros, makeBase);

const hello: Step<Meta, Base, typeof macros, string> = {
  name: "hello",
  meta: {},
  run: (ctx) => `hello from ${ctx.requestId}`,
};

if (import.meta.main) {
  execute(hello).then(console.log);
}
