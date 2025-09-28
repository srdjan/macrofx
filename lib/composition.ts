import type { Macro } from "../core.ts";

export function composeMacros<M1 extends readonly unknown[], M2 extends readonly unknown[]>(
  macros1: M1,
  macros2: M2,
): [...M1, ...M2] {
  return [...macros1, ...macros2] as [...M1, ...M2];
}

export function mergeMacroSets<const T extends readonly (readonly unknown[])[]>(
  ...macroSets: T
): T[number] extends readonly (infer U)[] ? readonly U[] : never {
  return macroSets.flat() as T[number] extends readonly (infer U)[] ? readonly U[] : never;
}

type ConditionFn<Meta> = (meta: Meta) => boolean;

export function whenMacro<Meta, BaseCtx, AddedCtx>(
  condition: ConditionFn<Meta>,
  macro: Macro<Meta, BaseCtx, AddedCtx>,
): Macro<Meta, BaseCtx, AddedCtx> {
  return {
    ...macro,
    name: `when(${macro.name})`,
    match: (meta) => condition(meta) && macro.match(meta),
  };
}

export function unlessMacro<Meta, BaseCtx, AddedCtx>(
  condition: ConditionFn<Meta>,
  macro: Macro<Meta, BaseCtx, AddedCtx>,
): Macro<Meta, BaseCtx, AddedCtx> {
  return whenMacro((meta) => !condition(meta), macro);
}

export function alwaysMacro<Meta, BaseCtx, AddedCtx>(
  macro: Omit<Macro<Meta, BaseCtx, AddedCtx>, "match">,
): Macro<Meta, BaseCtx, AddedCtx> {
  return {
    ...macro,
    match: () => true,
  } as Macro<Meta, BaseCtx, AddedCtx>;
}

export function neverMacro<Meta, BaseCtx, AddedCtx>(
  macro: Macro<Meta, BaseCtx, AddedCtx>,
): Macro<Meta, BaseCtx, AddedCtx> {
  return {
    ...macro,
    name: `never(${macro.name})`,
    match: () => false,
  };
}