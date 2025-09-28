import type { Macro } from "../core.ts";

export type MacroFactory<Meta, BaseCtx, AddedCtx, Config = void> =
  Config extends void
    ? () => Macro<Meta, BaseCtx, AddedCtx>
    : (config: Config) => Macro<Meta, BaseCtx, AddedCtx>;

export function createMacroFactory<Meta, BaseCtx, AddedCtx, Config = void>(
  factory: (config: Config) => Macro<Meta, BaseCtx, AddedCtx>,
): MacroFactory<Meta, BaseCtx, AddedCtx, Config> {
  return factory as MacroFactory<Meta, BaseCtx, AddedCtx, Config>;
}

export function withDefaults<Meta, BaseCtx, AddedCtx, Config extends Record<string, unknown>>(
  factory: (config: Config) => Macro<Meta, BaseCtx, AddedCtx>,
  defaults: Config,
): (config?: Partial<Config>) => Macro<Meta, BaseCtx, AddedCtx> {
  return (config?: Partial<Config>) => factory({ ...defaults, ...config } as Config);
}

export function renameMacro<Meta, BaseCtx, AddedCtx>(
  macro: Macro<Meta, BaseCtx, AddedCtx>,
  newName: string,
): Macro<Meta, BaseCtx, AddedCtx> {
  return { ...macro, name: newName };
}

export function extendMacro<Meta, BaseCtx, AddedCtx>(
  macro: Macro<Meta, BaseCtx, AddedCtx>,
  extension: Partial<Macro<Meta, BaseCtx, AddedCtx>>,
): Macro<Meta, BaseCtx, AddedCtx> {
  return {
    ...macro,
    ...extension,
    name: extension.name ?? macro.name,
    match: extension.match ?? macro.match,
  };
}