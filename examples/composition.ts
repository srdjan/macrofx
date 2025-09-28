import {
  cacheMacro,
  type CacheMeta,
  createPipeline,
  envMacro,
  type EnvMeta,
  type Step,
} from "../mod.ts";
import {
  alwaysMacro,
  composeMacros,
  mergeMacroSets,
  unlessMacro,
  whenMacro,
} from "../lib/composition.ts";
import { createMacroFactory, extendMacro, withDefaults } from "../lib/parameterized.ts";
import { createConsoleLogger, createTelemetryMacro } from "../lib/telemetry.ts";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = {
  log?: LogLevel;
};

const createLogMacro = createMacroFactory((config: { minLevel: LogLevel }) => {
  const levels: LogLevel[] = ["debug", "info", "warn", "error"];
  const minIndex = levels.indexOf(config.minLevel);

  return {
    name: "log",
    match: (m: LogMeta) => !!m.log,
    before: (_ctx, meta: LogMeta) => {
      const level = meta.log!;
      const levelIndex = levels.indexOf(level);
      if (levelIndex >= minIndex) {
        console.log(`[${level.toUpperCase()}] Step executing...`);
      }
    },
  };
});

const logMacroProduction = createLogMacro({ minLevel: "warn" });
const logMacroDevelopment = createLogMacro({ minLevel: "debug" });

const isDevelopment = Deno.env.get("NODE_ENV") !== "production";

const conditionalLogMacro = isDevelopment ? logMacroDevelopment : logMacroProduction;

type FeatureFlagMeta = {
  featureFlag?: string;
};

const featureFlagStore = new Set(["new-algorithm", "beta-ui"]);

const featureFlagMacro = {
  name: "featureFlag",
  match: (m: FeatureFlagMeta) => !!m.featureFlag,
  before: (_ctx, meta: FeatureFlagMeta) => {
    if (!featureFlagStore.has(meta.featureFlag!)) {
      return { skipped: true, reason: "feature flag disabled" };
    }
  },
};

const onlyWhenFeatureEnabled = whenMacro(
  (meta: FeatureFlagMeta) => !meta.featureFlag || featureFlagStore.has(meta.featureFlag),
  cacheMacro,
);

const timeoutMacroFactory = withDefaults(
  (config: { timeoutMs: number; label: string }) => ({
    name: config.label,
    match: (m: { timeout?: number }) => !!m.timeout,
    before: async (_ctx, meta: { timeout?: number }) => {
      const ms = meta.timeout!;
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (ms < 0) throw new Error("Timeout simulation");
    },
  }),
  { timeoutMs: 5000, label: "timeout" },
);

const fastTimeout = timeoutMacroFactory({ timeoutMs: 1000, label: "fastTimeout" });
const slowTimeout = timeoutMacroFactory({ timeoutMs: 30000, label: "slowTimeout" });

const metricsMacro = alwaysMacro({
  name: "metrics",
  resolve: () => {
    const metrics: Array<{ name: string; value: number; timestamp: number }> = [];
    return {
      recordMetric: (name: string, value: number) => {
        metrics.push({ name, value, timestamp: Date.now() });
      },
      getMetrics: () => metrics,
    };
  },
});

type Meta = EnvMeta & CacheMeta & LogMeta & FeatureFlagMeta & { timeout?: number };
type Base = { requestId: string };

const coreMacros = [envMacro, cacheMacro] as const;
const observabilityMacros = [conditionalLogMacro, metricsMacro] as const;
const resilienceMacros = [fastTimeout] as const;

const allMacros = mergeMacroSets(coreMacros, observabilityMacros, resilienceMacros);

const logger = createConsoleLogger({ verbose: true });
const telemetryMacro = createTelemetryMacro<Meta & { telemetry?: boolean }, Base>();

const productionMacros = composeMacros(allMacros, [telemetryMacro, featureFlagMacro] as const);

const { execute } = createPipeline<Meta & { telemetry?: boolean }, Base, typeof productionMacros>(
  productionMacros,
  () => ({ requestId: crypto.randomUUID() }),
);

const step1: Step<
  Meta & { telemetry?: boolean },
  Base,
  typeof productionMacros,
  string
> = {
  name: "fetch-data",
  meta: {
    env: ["API_URL"],
    cacheKey: "data:v1",
    log: "info",
    telemetry: logger,
  },
  run: ({ recordMetric }) => {
    recordMetric("fetch_count", 1);
    return "data fetched";
  },
};

const step2: Step<
  Meta & { telemetry?: boolean },
  Base,
  typeof productionMacros,
  string | { skipped: boolean; reason: string }
> = {
  name: "beta-feature",
  meta: {
    featureFlag: "beta-ui",
    log: "debug",
    telemetry: logger,
  },
  run: ({ recordMetric }) => {
    recordMetric("beta_feature_used", 1);
    return "beta feature executed";
  },
};

const step3: Step<
  Meta & { telemetry?: boolean },
  Base,
  typeof productionMacros,
  string | { skipped: boolean; reason: string }
> = {
  name: "disabled-feature",
  meta: {
    featureFlag: "disabled-feature",
    log: "warn",
    telemetry: logger,
  },
  run: () => {
    return "this should not execute";
  },
};

async function main() {
  console.log("🚀 Macro Composition Demo\n");

  console.log("1. Running step with env + cache + logging + metrics:");
  Deno.env.set("API_URL", "https://api.example.com");
  const result1 = await execute(step1);
  console.log("Result:", result1);

  console.log("\n2. Running step with enabled feature flag:");
  const result2 = await execute(step2);
  console.log("Result:", result2);

  console.log("\n3. Running step with disabled feature flag:");
  const result3 = await execute(step3);
  console.log("Result:", result3);

  console.log("\n📊 Telemetry Events:");
  const events = logger.getEvents();
  console.log(`Total events: ${events.length}`);
  console.log(
    "Event types:",
    [...new Set(events.map((e) => e.type))].join(", "),
  );

  console.log("\n✅ Demo completed!");
}

if (import.meta.main) {
  main().catch(console.error);
}