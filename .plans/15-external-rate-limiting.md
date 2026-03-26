# Plan: External Rate Limiting

## Objective
Introduce a production-safe external rate limiting backend to replace the current in-memory approach for production use, ensuring consistent enforcement across distributed/serverless instances while preserving the existing `RateLimiterPort` abstraction and public gateway contracts.

## Customer Value
- Makes `/auth` and `/ai` enforcement reliable in real distributed deployments rather than per-instance best effort
- Preserves one consistent rate-limiting model for clients while enabling production-grade shared enforcement behind the gateway
- Reduces abuse and coordination risk in serverless environments where in-memory counters cannot provide trustworthy global behavior

## Scope Decisions (Locked)
- The public `/auth` and `/ai` API contracts must remain unchanged
- The `RateLimiterPort` interface must remain intact; the external backend must fit behind the existing port rather than redesigning the rate-limiting contract
- Core gateway logic must not hardcode a specific vendor, even if the implementation assumes Redis-like shared-store capabilities such as atomic mutation and key TTL
- Development and local validation may continue using the existing in-memory limiter, but that path must remain explicitly non-production
- Production behavior must fail closed by default when the external rate-limiting backend is unavailable; failures must not silently disable enforcement
- Key construction must remain aligned with normalized identity handling so malformed or bypass-oriented identifiers do not create unbounded storage cardinality

## Prerequisites
- `docs/system-spec.md`
- `docs/development.md`
- `.plans/04-rate-limiting-and-observability.md`
- `.plans/06-end-to-end-gateway-api.md`
- `.plans/14-auth-hardening.md`

## Implementation Checklist

### 1. Production Requirements for Distributed Enforcement
- [ ] Define production requirements for the external rate limiter, including atomic increments, TTL-based windowing, concurrency-safe enforcement, and compatibility with stateless serverless execution
- [ ] Ensure the design does not depend on in-memory process state, instance affinity, or single-node coordination assumptions
- [ ] Define what correctness guarantees are required for v1 enforcement across concurrent requests hitting multiple gateway instances

### 2. Rate Limiting Model
- [ ] Choose and document the rate limiting algorithm appropriate for current needs, with explicit rationale for how it aligns with the existing `/auth` and `/ai` policy model
- [ ] Preserve the current endpoint-specific enforcement behavior, including stricter `/auth` limits and the existing hard-rejection posture when limits are exceeded
- [ ] Ensure the selected algorithm can be implemented with predictable shared-store semantics and remains understandable for operators and maintainers

### 3. Data Model and Key Design
- [ ] Define how external rate-limit keys are constructed from endpoint, normalized `clientId`, and network identity context within the existing keying model
- [ ] Ensure key storage uses TTL to prevent unbounded accumulation and to match the selected windowing behavior
- [ ] Tie key safety to prior identifier normalization rules so malformed, excessively variable, or bypass-oriented identifiers cannot cheaply create key explosion
- [ ] Define predictable storage behavior and bounded cardinality expectations for production operators

### 4. Backend Integration Behind `RateLimiterPort`
- [ ] Implement a `RateLimiterPort`-compatible external backend that keeps the core gateway runtime unaware of vendor-specific details
- [ ] Preserve compatibility with the current service flow so `/auth` and `/ai` continue using the same rate-limiting seam without contract changes
- [ ] Ensure backend-specific logic remains isolated in adapter/infrastructure code rather than leaking into domain or policy layers

### 5. Failure Modes and Degradation Policy
- [ ] Define explicit production behavior when the external backend is unavailable, degraded, or returns ambiguous results
- [ ] Enforce fail-closed behavior by default in production so rate limiting is never silently bypassed by backend outages
- [ ] Preserve explicit local/development fallback to the in-memory limiter without implying that fallback is acceptable for production coordination
- [ ] Define any safe operator-visible error behavior and observability signals for backend failures that impact enforcement

### 6. Integration with Existing System
- [ ] Ensure the external limiter remains compatible with current `/auth` and `/ai` rate-limiting usage, policies, and request flow boundaries
- [ ] Preserve the existing `createGatewayService` wiring model while making production-safe external adapter selection explicit and predictable
- [ ] Validate that rate-limit enforcement continues to occur before downstream provider execution and remains portable across runtime adapters

### 7. Configuration and Operator Wiring
- [ ] Define configuration requirements for selecting and connecting the external rate-limiting backend without coupling the core config contract to a single vendor name
- [ ] Clarify production operator responsibilities for supplying shared backend infrastructure, secrets/connection details, and availability expectations
- [ ] Ensure production configuration makes the non-production in-memory fallback unmistakably distinct from the external enforcement path

### 8. Observability and Operational Signals
- [ ] Define observability for rate-limit hits, backend failures, degraded enforcement conditions, and unusual rejection patterns without logging sensitive identifiers unsafely
- [ ] Ensure operational signals distinguish normal limit enforcement from infrastructure failure modes
- [ ] Keep observability aligned with existing gateway boundaries and avoid provider- or vendor-specific leakage into core telemetry semantics

### 9. Testing Strategy
- [ ] Add tests for atomic concurrent enforcement behavior, TTL/window expiration behavior, and consistent rejection across simulated multi-instance usage patterns
- [ ] Add failure-mode tests covering backend unavailability, fail-closed production behavior, and explicit local/dev fallback expectations
- [ ] Preserve existing `/auth` and `/ai` rate-limiting behavior tests while extending coverage for the external adapter path
- [ ] Include integration-style tests that validate the external rate limiter can be wired through the current gateway service without changing public API behavior

## Non-Goals
- Changing the public gateway API contracts or redesigning the `RateLimiterPort` abstraction
- Embedding a specific external service vendor directly into core gateway logic
- Removing the existing in-memory limiter for local development and deterministic tests

## Acceptance Criteria
- [ ] A production-safe external rate limiter exists behind `RateLimiterPort` and supports shared enforcement across distributed/serverless instances
- [ ] `/auth` and `/ai` rate limiting remain behaviorally compatible with current policies while gaining concurrency-safe shared enforcement
- [ ] Key design, TTL handling, and identifier normalization together provide bounded and predictable storage behavior
- [ ] Production backend failures fail closed by default and do not silently disable enforcement
- [ ] Local development retains an explicit non-production in-memory fallback without weakening production safety expectations
