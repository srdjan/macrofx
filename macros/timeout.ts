import type { Empty, Macro } from "../core.ts";
import { withTimeout } from "../helpers.ts";

export type TimeoutMeta = { timeoutMs?: number };

export const timeoutWrapper = <T>(ms?: number, label?: string) => (thunk: () => Promise<T>) =>
  typeof ms === "number" ? withTimeout(thunk(), ms, label) : thunk();

export const timeoutMacro: Macro<TimeoutMeta, Empty, Empty> = {
  name: "timeout",
  match: (m) => typeof m.timeoutMs === "number",
};
export const timeoutFromMeta = (m?: TimeoutMeta, label?: string) => <T>(fn: () => Promise<T>) =>
  timeoutWrapper<T>(m?.timeoutMs, label)(fn);
