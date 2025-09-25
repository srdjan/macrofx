import type { Macro, Step } from "../core.ts";

// Types for debugging and introspection
export type PipelineMetrics = {
  totalExecutions: number;
  averageExecutionTime: number;
  macroExecutions: Map<string, number>;
  errorCount: number;
  cacheHitRate: number;
};

export type ExecutionTrace = {
  stepName: string;
  metadata: unknown;
  activeMacros: string[];
  phases: Array<{
    phase: "validate" | "resolve" | "before" | "run" | "after" | "onError";
    macro?: string;
    duration: number;
    result?: unknown;
    error?: unknown;
  }>;
  totalDuration: number;
  success: boolean;
};

// Debugging utilities for pipelines
export class PipelineDebugger<Meta, BaseCtx, Ms extends readonly Macro<unknown, unknown, unknown>[]> {
  private metrics: PipelineMetrics = {
    totalExecutions: 0,
    averageExecutionTime: 0,
    macroExecutions: new Map(),
    errorCount: 0,
    cacheHitRate: 0,
  };

  private traces: ExecutionTrace[] = [];
  private maxTraces = 100;
  private enabled = true;

  constructor(
    private macros: Ms,
    private makeBase: () => BaseCtx,
  ) {}

  // List macros that would be active for given metadata
  listActiveMacros(meta: Meta): Array<{ name: string; willMatch: boolean }> {
    return this.macros.map((m) => ({
      name: m.name,
      willMatch: m.match(meta),
    }));
  }

  // Dry run without side effects
  async simulateDryRun<Out, SpecificMeta extends Meta>(
    step: Step<Meta, BaseCtx, Ms, Out, SpecificMeta>,
  ): Promise<{
    wouldExecute: boolean;
    activeMacros: string[];
    validationErrors: Array<{ macro: string; error: unknown }>;
    contextKeys: string[];
  }> {
    const { meta } = step;
    const active = this.macros.filter((m) => m.match(meta));

    // Check validation
    const validationErrors: Array<{ macro: string; error: unknown }> = [];
    for (const m of active) {
      if (m.validate) {
        try {
          m.validate(meta);
        } catch (error) {
          validationErrors.push({ macro: m.name, error });
        }
      }
    }

    // Simulate resolve to get context keys
    const base = this.makeBase();
    const contextKeys = Object.keys(base);
    const resolved = await Promise.all(
      active.map((m) => (m.resolve ? m.resolve(base, meta) : undefined)),
    );

    for (const obj of resolved) {
      if (obj && typeof obj === "object") {
        contextKeys.push(...Object.keys(obj as Record<string, unknown>));
      }
    }

    return {
      wouldExecute: validationErrors.length === 0,
      activeMacros: active.map((m) => m.name),
      validationErrors,
      contextKeys: [...new Set(contextKeys)],
    };
  }

  // Get execution metrics
  getMetrics(): PipelineMetrics {
    return { ...this.metrics };
  }

  // Get recent execution traces
  getTraces(limit = 10): ExecutionTrace[] {
    return this.traces.slice(-limit);
  }

  // Clear metrics and traces
  reset(): void {
    this.metrics = {
      totalExecutions: 0,
      averageExecutionTime: 0,
      macroExecutions: new Map(),
      errorCount: 0,
      cacheHitRate: 0,
    };
    this.traces = [];
  }

  // Enable/disable debugging
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  // Wrap execute function with tracing
  wrapExecute<Out, SpecificMeta extends Meta>(
    execute: (step: Step<Meta, BaseCtx, Ms, Out, SpecificMeta>) => Promise<Out>,
  ): (step: Step<Meta, BaseCtx, Ms, Out, SpecificMeta>) => Promise<Out> {
    return async (step) => {
      if (!this.enabled) {
        return execute(step);
      }

      const trace: ExecutionTrace = {
        stepName: step.name,
        metadata: step.meta,
        activeMacros: [],
        phases: [],
        totalDuration: 0,
        success: false,
      };

      const startTime = performance.now();
      let result: Out;

      try {
        // Execute with minimal overhead
        result = await execute(step);
        trace.success = true;
      } catch (error) {
        this.metrics.errorCount++;
        trace.success = false;
        throw error;
      } finally {
        const duration = performance.now() - startTime;
        trace.totalDuration = duration;

        // Update metrics
        this.metrics.totalExecutions++;
        this.metrics.averageExecutionTime =
          (this.metrics.averageExecutionTime * (this.metrics.totalExecutions - 1) + duration) /
          this.metrics.totalExecutions;

        // Store trace
        if (this.traces.length >= this.maxTraces) {
          this.traces.shift();
        }
        this.traces.push(trace);
      }

      return result;
    };
  }

  // Analyze macro usage patterns
  analyzeUsage(): {
    mostUsedMacros: Array<{ name: string; count: number }>;
    unusedMacros: string[];
    errorRate: number;
  } {
    const sorted = Array.from(this.metrics.macroExecutions.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    const unusedMacros = this.macros
      .filter((m) => !this.metrics.macroExecutions.has(m.name))
      .map((m) => m.name);

    return {
      mostUsedMacros: sorted.slice(0, 5),
      unusedMacros,
      errorRate: this.metrics.totalExecutions > 0
        ? this.metrics.errorCount / this.metrics.totalExecutions
        : 0,
    };
  }
}

// Factory function for creating a debuggable pipeline
export function createPipelineWithDebug<
  Meta extends object,
  BaseCtx,
  Ms extends readonly Macro<unknown, unknown, unknown>[],
>(
  macros: Ms,
  makeBase: () => BaseCtx,
): {
  execute: <Out, SpecificMeta extends Meta>(
    step: Step<Meta, BaseCtx, Ms, Out, SpecificMeta>,
  ) => Promise<Out>;
  debug: PipelineDebugger<Meta, BaseCtx, Ms>;
} {
  // Import the actual createPipeline (avoid circular dependency)
  const { createPipeline } = (() => {
    // This would normally import from core.ts
    // For now, return a mock implementation
    return {
      createPipeline: <M, B, Macros>(ms: Macros, mb: () => B) => ({
        execute: async <O, SM extends M>(step: Step<M, B, Macros, O, SM>): Promise<O> => {
          // Simplified implementation for demonstration
          const result = await step.run(mb() as any);
          return result;
        },
      }),
    };
  })();

  const pipeline = createPipeline(macros, makeBase);
  const debugger = new PipelineDebugger(macros, makeBase);

  return {
    execute: debugger.wrapExecute(pipeline.execute),
    debug: debugger,
  };
}

// Helper to format traces for console output
export function formatTrace(trace: ExecutionTrace): string {
  const lines: string[] = [];
  lines.push(`📊 Step: ${trace.stepName}`);
  lines.push(`   Duration: ${trace.totalDuration.toFixed(2)}ms`);
  lines.push(`   Success: ${trace.success ? "✅" : "❌"}`);
  lines.push(`   Active Macros: ${trace.activeMacros.join(", ") || "none"}`);

  if (trace.phases.length > 0) {
    lines.push(`   Phases:`);
    for (const phase of trace.phases) {
      const emoji = phase.error ? "❌" : "✓";
      lines.push(
        `     ${emoji} ${phase.phase}${phase.macro ? ` (${phase.macro})` : ""}: ${
          phase.duration.toFixed(2)
        }ms`,
      );
    }
  }

  return lines.join("\n");
}

// Helper to visualize macro dependencies
export function visualizeMacroDependencies<
  Meta,
  BaseCtx,
  Ms extends readonly Macro<unknown, unknown, unknown>[],
>(
  macros: Ms,
  meta: Meta,
): string {
  const lines: string[] = [];
  lines.push("🔧 Macro Execution Plan:");

  const active = macros.filter((m) => m.match(meta));
  const inactive = macros.filter((m) => !m.match(meta));

  if (active.length > 0) {
    lines.push("\n✅ Active Macros:");
    for (const m of active) {
      const capabilities: string[] = [];
      if (m.validate) capabilities.push("validate");
      if (m.resolve) capabilities.push("resolve");
      if (m.before) capabilities.push("before");
      if (m.after) capabilities.push("after");
      if (m.onError) capabilities.push("onError");

      lines.push(`   • ${m.name}: [${capabilities.join(", ")}]`);
    }
  }

  if (inactive.length > 0) {
    lines.push("\n⏭️  Inactive Macros:");
    for (const m of inactive) {
      lines.push(`   • ${m.name}`);
    }
  }

  return lines.join("\n");
}