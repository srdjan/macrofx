import type { Macro } from "../core.ts";

export type TelemetryEvent =
  | { type: "step:start"; stepName: string; timestamp: number }
  | { type: "step:end"; stepName: string; timestamp: number; durationMs: number }
  | { type: "step:error"; stepName: string; timestamp: number; error: unknown }
  | { type: "macro:resolve"; macroName: string; stepName: string; timestamp: number }
  | { type: "macro:before"; macroName: string; stepName: string; timestamp: number }
  | { type: "macro:after"; macroName: string; stepName: string; timestamp: number }
  | { type: "macro:error"; macroName: string; stepName: string; timestamp: number; error: unknown };

export type TelemetryCollector = {
  emit: (event: TelemetryEvent) => void;
  getEvents: () => readonly TelemetryEvent[];
  clear: () => void;
};

export function createTelemetryCollector(): TelemetryCollector {
  const events: TelemetryEvent[] = [];

  return {
    emit: (event: TelemetryEvent) => {
      events.push(event);
    },
    getEvents: () => events,
    clear: () => {
      events.length = 0;
    },
  };
}

export type TelemetryMeta = {
  telemetry?: boolean | TelemetryCollector;
};

export function createTelemetryMacro<Meta extends TelemetryMeta, BaseCtx>(): Macro<
  Meta,
  BaseCtx,
  { telemetry: TelemetryCollector }
> {
  return {
    name: "telemetry",
    match: (m) => !!m.telemetry,
    resolve: (_base, meta) => {
      const collector = meta.telemetry === true
        ? createTelemetryCollector()
        : meta.telemetry as TelemetryCollector;
      return { telemetry: collector };
    },
  };
}

export function wrapMacroWithTelemetry<Meta, BaseCtx, AddedCtx>(
  macro: Macro<Meta, BaseCtx, AddedCtx>,
  collector: TelemetryCollector,
  stepName: string,
): Macro<Meta, BaseCtx, AddedCtx> {
  return {
    ...macro,
    resolve: async (base, meta) => {
      collector.emit({
        type: "macro:resolve",
        macroName: macro.name,
        stepName,
        timestamp: Date.now(),
      });
      if (!macro.resolve) return undefined as AddedCtx;
      return await macro.resolve(base, meta);
    },
    before: async (ctx, meta) => {
      collector.emit({
        type: "macro:before",
        macroName: macro.name,
        stepName,
        timestamp: Date.now(),
      });
      if (!macro.before) return undefined;
      return await macro.before(ctx, meta);
    },
    after: (ctx, meta, result) => {
      collector.emit({
        type: "macro:after",
        macroName: macro.name,
        stepName,
        timestamp: Date.now(),
      });
      if (!macro.after) return undefined;
      return macro.after(ctx, meta, result);
    },
    onError: (base, meta, err) => {
      collector.emit({
        type: "macro:error",
        macroName: macro.name,
        stepName,
        timestamp: Date.now(),
        error: err,
      });
      if (!macro.onError) return undefined;
      return macro.onError(base, meta, err);
    },
  };
}

export type ConsoleLoggerConfig = {
  prefix?: string;
  colors?: boolean;
  verbose?: boolean;
};

export function createConsoleLogger(config: ConsoleLoggerConfig = {}): TelemetryCollector {
  const { prefix = "[macrofx]", colors = true, verbose = false } = config;
  const events: TelemetryEvent[] = [];

  const color = (code: number, text: string) =>
    colors ? `\x1b[${code}m${text}\x1b[0m` : text;

  return {
    emit: (event: TelemetryEvent) => {
      events.push(event);

      if (!verbose && event.type.startsWith("macro:")) return;

      switch (event.type) {
        case "step:start":
          console.log(`${color(36, prefix)} ${color(1, "→")} ${event.stepName}`);
          break;
        case "step:end":
          console.log(
            `${color(36, prefix)} ${color(32, "✓")} ${event.stepName} ${color(90, `(${event.durationMs.toFixed(1)}ms)`)}`,
          );
          break;
        case "step:error":
          console.log(`${color(36, prefix)} ${color(31, "✗")} ${event.stepName}`);
          break;
        case "macro:resolve":
          console.log(`${color(36, prefix)}   ${color(90, `↳ ${event.macroName}`)} resolve`);
          break;
        case "macro:before":
          console.log(`${color(36, prefix)}   ${color(90, `↳ ${event.macroName}`)} before`);
          break;
        case "macro:after":
          console.log(`${color(36, prefix)}   ${color(90, `↳ ${event.macroName}`)} after`);
          break;
        case "macro:error":
          console.log(`${color(36, prefix)}   ${color(31, `↳ ${event.macroName}`)} error`);
          break;
      }
    },
    getEvents: () => events,
    clear: () => {
      events.length = 0;
    },
  };
}