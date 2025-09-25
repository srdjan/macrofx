
## Overview

Below is a practical, scenario‑driven guide to where macrofx shines. Each use case lists:
- Problem addressed
- Relevant built‑in macros (env, cache, retry, timeout, sink, schema)
- Useful custom macros to consider
- How metadata (opt‑in, composable, type‑safe) improves over traditional approaches

Note: macrofx’s metadata automatically types the step context; steps remain pure while macros provide effects at the edges.

---

## Web APIs and Microservices

### 1) Authenticated request handlers with role/tenant context
- Problem: Safely inject auth/role/tenant info and short‑circuit unauthorized requests without duplicating checks.
- Built‑ins: schema (validate request), retry/timeout (outbound calls), sink (audit/metrics), env (secrets/keys), cache (small lookups).
- Custom macros: auth (JWT/OIDC), role (RBAC/ABAC), tenant (org scoping), transaction (DB), rateLimit, idempotencyKey, traceId.
- Metadata advantage: Steps declare exactly what they need (e.g., { role: "admin" }), gaining typed ctx and compile‑time gating; changing a policy is a metadata tweak vs. rewiring handlers.

### 2) Resilient outbound HTTP to flaky services
- Problem: Calls to payment/identity/search often fail intermittently; need bounded latency and standardized retries.
- Built‑ins: retry, timeout, cache (GETs), schema (response validation), sink (latency metrics).
- Custom macros: circuitBreaker (open/half‑open/closed), backoffStrategy, hedging.
- Metadata advantage: Per‑endpoint resilience tuned via meta, not ad‑hoc try/catch; typing ensures only steps that opt‑in can access injected HTTP client settings.

### 3) Feature-flagged behavior and phased rollouts
- Problem: Toggle features per environment/user cohort without scattering branches.
- Built‑ins: env, sink, cache.
- Custom macros: featureFlag, experiment (A/B), cohort, killSwitch.
- Metadata advantage: Flags become declarative capabilities ({ feature: "newSearch" }) with typed context and centralized evaluation; tests can force variants by meta.

---

## CLI Tools and Automation

### 4) Secrets-aware automation scripts
- Problem: Safely access secrets, standardize timeouts/retries, and avoid accidental output of sensitive data.
- Built‑ins: env (secrets), timeout, retry, sink (console/memory), schema (CLI args).
- Custom macros: filesystem (safe IO), redaction (mask PII in logs), dryRun (guard effects), concurrencyLimit.
- Metadata advantage: CLI steps opt‑in to capabilities; testing uses memory sink + fixed env; dry‑run can be toggled by meta across steps.

### 5) Idempotent job execution with deduplication
- Problem: Re-running CI/CD/cron steps should not duplicate side effects.
- Built‑ins: retry, timeout, cache, sink.
- Custom macros: idempotency (dedupe keys), lock (distributed mutex), checkpoint (resume).
- Metadata advantage: Idempotency is declarative—enabled per step with typed ctx; behavior is uniform and reused, not reimplemented per job.

---

## Data Processing and ETL Pipelines

### 6) Validating and transforming large datasets
- Problem: Ensure data quality and collect per‑batch metrics; handle external lookups safely.
- Built‑ins: schema (row/record validation), cache (dimension lookups), retry/timeout (HTTP/DB), sink (metrics).
- Custom macros: database (typed queries), transaction (savepoints), batchWindow (aggregation).
- Metadata advantage: Each step declares validation and capabilities; schema‑driven ctx prevents consuming unvalidated data; metrics collection centralized via sink.

### 7) Incremental sync jobs
- Problem: Move only changed data reliably, with resumability.
- Built‑ins: retry/timeout, sink, env.
- Custom macros: checkpoint (watermarks), sourceState/targetState, dedupe.
- Metadata advantage: Metadata captures sync strategy (e.g., { checkpoint: true }); the injected ctx exposes strictly what’s needed to move the watermark forward—easier to test and reason.

---

## Testing and Development Workflows

### 8) Deterministic tests for side-effectful code
- Problem: Make IO/time/uuid deterministic without wiring mocks everywhere.
- Built‑ins: sink (memory), schema (assert invariants).
- Custom macros: clock (fixed now/timestamp), crypto (fixed UUID), fakeDb/fakeHttp, recorder/replayer (golden tests).
- Metadata advantage: Steps remain pure; tests pick a macro array (adapters) + metadata to inject fakes; zero changes to domain logic.

### 9) Snapshot/golden regression testing for pipelines
- Problem: Validate end‑to‑end transformations without fragile bespoke setups.
- Built‑ins: sink (memory) for capturing outputs.
- Custom macros: snapshot (serialize ctx/result), diffReporter.
- Metadata advantage: One metadata flag toggles snapshotting; captures typed ctx/result consistently.

---

## UI / Frontend Applications

### 10) Server-side rendering (SSR) with strict budgets
- Problem: Keep SSR responsive; enforce rendering time budgets and consistent telemetry.
- Built‑ins: env (tokens), timeout (budget), cache (view/data), sink (telemetry), schema (props).
- Custom macros: i18n (translations), userSession, csp (nonce/policies), featureFlag.
- Metadata advantage: Pages declare constraints (e.g., { timeoutMs: 200 }); the ctx only includes the capabilities they ask for; tests can enable memory sink to assert telemetry.

### 11) Client-side data fetching with safety
- Problem: Network flakiness and schema drift cause runtime errors.
- Built‑ins: retry, timeout, cache, schema (response).
- Custom macros: storage (localStorage/indexedDB), authHeader, etag.
- Metadata advantage: Fetch steps that declare schema get typed data; absent schema yields no access to parsed/validated fields; caching and deadlines are opt‑in per request.

---

## DevOps and Infrastructure Tooling

### 12) Deployment orchestration with rollback
- Problem: Multi‑step deploys need careful rollback and bounded retries.
- Built‑ins: retry, timeout, sink, env.
- Custom macros: k8s/terraform (ports), transaction/rollback (strategy), approvalGate, canary.
- Metadata advantage: Declare rollback/approval per step; ctx has only the k8s/TF capabilities that step needs, enabling focused dry-runs in tests.

### 13) Reliability tasks and observability
- Problem: Consistent, structured metrics/logging/traces across tools.
- Built‑ins: sink (console/memory for metrics logs), retry/timeout.
- Custom macros: tracer (OpenTelemetry), metrics (counter/histogram), redaction (PII).
- Metadata advantage: Observability is a capability, not sprinkled logging; flipping sink to memory in tests asserts emitted telemetry deterministically.

---

## Payments/Billing Workflows

### 14) Idempotent payment operations
- Problem: Payment APIs must be idempotent and resilient.
- Built‑ins: retry, timeout, schema (request/response), sink (audit).
- Custom macros: idempotencyKey, circuitBreaker, transaction (eventual DB consistency).
- Metadata advantage: Idempotency is per‑operation metadata; the ctx provides typed helpers only when declared, preventing accidental bypass.

---

## Security and Compliance

### 15) PII redaction and encryption
- Problem: Prevent sensitive data from leaking to logs; encrypt at rest.
- Built‑ins: sink (structured logs), schema (tag fields).
- Custom macros: redaction (PII tags → mask), crypto (encrypt/decrypt), auditTrail.
- Metadata advantage: Redaction is declarative ({ redaction: "strict" }) and applied in a shared macro; steps never import redaction logic.

---

## Example: Metadata-driven benefits

- Traditional: Hand-wire retries/timeouts/logging around every function; tests must stub network/time/logging manually; capabilities accessible everywhere.
- macrofx: Toggle behaviors by declaring metadata; only the declared capabilities appear in ctx; tests switch macro adapters and use memory sink to assert outputs.

````ts mode=EXCERPT
type Meta = { cacheKey?: string; retry?: { times: number; delayMs: number }; sink?: "memory" };
const macros = [cacheMacro, retryMacro, sinkMacro] as const;

const step = {
  name: "fetchUsers",
  meta: { cacheKey: "users:v1", retry: { times: 3, delayMs: 100 }, sink: "memory" },
  run: async ({ cache, emit }) => { const users = await getUsers(); cache.set("users:v1", users); emit({ users }); return users; },
};
````

Benefits:
- Type safety: `cache` and `emit` exist only because the metadata includes `cacheKey` and `sink`.
- Composability: Add/remove capabilities by editing metadata.
- Effects at edges: `run` stays focused on logic; IO/telemetry come from macros.
- Testability: Switch `sink: "memory"` and assert emitted events; stub network via adapters.

---

## Closing Notes

- Start with built‑ins for 80% of needs; add small custom macros for domain‑specific capabilities (auth, DB, tracing, feature flags, etc.).
- Prefer the hybrid metadata pattern: keep the top‑level property optional to opt‑in a macro; when present, use a discriminant inside to strongly gate types.
- The result is cleaner separation of concerns, less boilerplate, and safer, more testable code across many domains.
