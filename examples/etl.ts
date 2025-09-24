import {
  createPipeline,
  type Empty,
  schemaMacro,
  type SchemaMeta,
  sinkMacro,
  type SinkMeta,
  type Step,
} from "../mod.ts";

type Meta = SchemaMeta & SinkMeta & { window?: { size: number } };
type Base = Empty;
const makeBase = (): Base => ({});

const windowMacro = {
  name: "window",
  match: (m: Meta) => !!m.window,
  resolve: (_b: Base, m: Meta) => ({ window: { size: m.window!.size } }),
} as const;

const macros = [schemaMacro, sinkMacro, windowMacro] as const;
const { execute } = createPipeline<Meta, Base, typeof macros>(macros, makeBase);

const avgAge: Step<Meta, Base, typeof macros, { avg: number }> = {
  name: "avg-age",
  meta: { schema: "Person[]", window: { size: 2 }, sink: "console" },
  run: ({ data, emit, window }) => {
    const avg = data.reduce((n, p) => n + p.age, 0) / data.length;
    emit({ metric: "avgAge", value: avg, window });
    return { avg };
  },
};

if (import.meta.main) {
  execute(avgAge).then((x) => console.log("etl result:", x));
}
