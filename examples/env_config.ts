import { createPipeline, envMacro, type EnvMeta, type Step } from "../mod.ts";

type Meta = EnvMeta;
type Base = { serviceName: string };

const makeBase = (): Base => ({ serviceName: "billing" });
const macros = [envMacro] as const;
const { execute } = createPipeline<Meta, Base, typeof macros>(macros, makeBase);

type ConfigMeta = { env: ["DATABASE_URL"] };

const readConfig: Step<
  Meta,
  Base,
  typeof macros,
  { serviceName: string; dbUrl?: string },
  ConfigMeta
> = {
  name: "read-config",
  meta: { env: ["DATABASE_URL"] },
  run: ({ serviceName, env }) => ({
    serviceName,
    dbUrl: env.DATABASE_URL,
  }),
};

if (import.meta.main) {
  execute(readConfig).then(console.log);
}
