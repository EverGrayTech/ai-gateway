# Plan: Rate Limiting and Observability

## Objective
Define the strict abuse-prevention and baseline telemetry layer for `@evergraytech/ai-gateway`, including pluggable rate-limiting backends, request/event instrumentation, and development-safe fallbacks for a serverless deployment model.

## Customer Value
- Prevents uncontrolled or automated usage spikes that could drive cost or destabilize the hosted experience
- Gives operators enough visibility to understand request volume, failures, and likely cost drivers in the MVP
- Keeps infrastructure choices flexible by isolating backend-specific rate limiting and telemetry concerns behind interfaces

## Scope Decisions (Locked)
- Both `/auth` and `/ai` must be rate limited with hard enforcement and no soft-warning mode
- Rate limiting must use both IP-derived context and `clientId` context where available
- Production design should assume external backing services for durable coordination, while local development may use simpler fallbacks
- Observability in v1 is system-level only; dashboards, billing, and user-facing analytics are out of scope

## Prerequisites
- `docs/system-spec.md`
- `.plans/01-serverless-service-foundation.md`
- `.plans/02-auth-token-issuance.md`
- `.plans/03-policy-and-enforcement-core.md`

## Implementation Checklist

### 1. Rate Limiting Interfaces
- [x] Define rate-limit keying strategy using endpoint, IP-derived identity, and `clientId`
- [x] Define pluggable storage interfaces suitable for external backends such as Redis or managed key-value stores
- [x] Define development fallback behavior that preserves contract semantics without pretending to be production-grade

### 2. Enforcement Behavior
- [x] Define distinct rate-limit policies for `/auth` and `/ai` based on abuse risk and expected traffic shape
- [x] Establish stable response semantics for exceeded limits, including retry-safe behavior where appropriate
- [x] Ensure rate-limit checks integrate cleanly into the request pipeline before expensive work or upstream calls begin

### 3. Metrics and Event Model
- [x] Define baseline telemetry events for request counts, error counts, rate-limit violations, and approximate token usage when available
- [x] Define structured logging fields and metric dimensions for endpoint, app context, provider/model context, and outcome class
- [x] Ensure telemetry can be emitted without coupling the core service to one specific vendor backend

### 4. Sensitive Data Handling
- [x] Define observability rules that exclude raw tokens, provider keys, prompts, and other sensitive payload details from logs/metrics
- [x] Establish safe redaction behavior for request and provider error paths
- [x] Ensure tracing or correlation metadata improves diagnosis without increasing leakage risk

### 5. Test and Local Verification Strategy
- [x] Verify rate-limit behavior for allowed traffic, exceeded traffic, and backend-degraded scenarios
- [x] Verify both `/auth` and `/ai` emit the intended baseline telemetry events and counters
- [x] Verify development fallbacks support local testing while making their non-production nature explicit

## Acceptance Criteria
- [x] `/auth` and `/ai` both enforce hard server-side rate limits using IP and `clientId` context
- [x] Rate-limiting storage and telemetry emission are abstracted behind pluggable interfaces suitable for serverless deployment
- [x] The gateway records request/error/rate-limit activity and approximate token usage where available
- [x] Logging and metrics avoid sensitive data leakage while still supporting operator diagnosis
- [x] Local development can exercise these behaviors without requiring production infrastructure choices to be finalized
