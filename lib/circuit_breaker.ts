// Simple circuit breaker helper with closed/open/half_open states.
// Use to guard flaky operations. Complements retry/timeout helpers.

export type CircuitBreaker = {
  readonly allow: () => boolean;
  readonly onSuccess: () => void;
  readonly onFailure: () => void;
  readonly state: () => "closed" | "open" | "half_open";
  readonly wrap: <T>(fn: () => Promise<T>) => Promise<T>;
};

export const createCircuitBreaker = (
  fails: number,
  resetMs: number,
): CircuitBreaker => {
  const threshold = Math.max(1, Math.floor(fails));
  const reset = Math.max(1, Math.floor(resetMs));

  let failureCount = 0;
  let openedAt = 0;
  let halfProbeInFlight = false;
  let mode: "closed" | "open" | "half_open" = "closed";

  const now = () => Date.now();

  const allow = (): boolean => {
    if (mode === "closed") return true;
    if (mode === "open") {
      if (now() - openedAt >= reset) {
        mode = "half_open";
        halfProbeInFlight = false;
      } else {
        return false;
      }
    }
    // half_open: allow a single probe at a time
    if (mode === "half_open") {
      if (halfProbeInFlight) return false;
      halfProbeInFlight = true;
      return true;
    }
    return false;
  };

  const onSuccess = (): void => {
    if (mode === "half_open") {
      mode = "closed";
      halfProbeInFlight = false;
    }
    // On success, reset failure counter
    failureCount = 0;
  };

  const onFailure = (): void => {
    if (mode === "half_open") {
      // Probe failed -> open again
      mode = "open";
      openedAt = now();
      halfProbeInFlight = false;
      failureCount = 0;
      return;
    }
    if (mode === "closed") {
      failureCount++;
      if (failureCount >= threshold) {
        mode = "open";
        openedAt = now();
        failureCount = 0;
      }
    }
  };

  const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (!allow()) throw new Error("circuit_breaker: open");
    try {
      const v = await fn();
      onSuccess();
      return v;
    } catch (e) {
      onFailure();
      throw e;
    }
  };

  return { allow, onSuccess, onFailure, state: () => mode, wrap } as const;
};

export const runWithCircuitBreaker = <T>(br: CircuitBreaker, fn: () => Promise<T>) =>
  br.wrap(fn);
