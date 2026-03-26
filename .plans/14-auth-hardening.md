# Plan: Auth Hardening

## Objective
Harden the `/auth` endpoint against token issuance abuse while preserving the existing anonymous `appId` + `clientId` model, the current signed-token architecture, and the public gateway API contracts.

## Customer Value
- Makes public `/auth` exposure safer without introducing user accounts or external identity systems
- Reduces token farming and scripted abuse risk while preserving the lightweight anonymous gateway workflow
- Strengthens operator confidence that issued tokens remain bounded, enforceable, and aligned with server-side policy controls

## Scope Decisions (Locked)
- No user authentication, login, account system, CAPTCHA, or external identity provider may be introduced
- The public `/auth` and `/ai` API contracts must remain unchanged
- The existing HMAC-signed token structure and shared-secret signing approach must remain intact
- All enforcement must remain server-side and fit the current stateless serverless HTTP deployment model
- This phase may mention stronger future replay defenses that require additional stateful coordination, but those mechanisms are out of scope for implementation in this hardening phase
- `appId` and `clientId` must be treated as part of the gateway security boundary, not merely as input fields, because they influence request context, rate limiting, token issuance, observability, and abuse controls

## Prerequisites
- `docs/system-spec.md`
- `docs/development.md`
- `.plans/02-auth-token-issuance.md`
- `.plans/03-policy-and-enforcement-core.md`
- `.plans/04-rate-limiting-and-observability.md`
- `.plans/06-end-to-end-gateway-api.md`

## Implementation Checklist

### 1. Threat Model and Abuse Scope
- [x] Define realistic `/auth` abuse scenarios for v1, including token farming via scripted requests, burst issuance, replay or rapid reuse of valid tokens, and bypass attempts using rotating IPs or rotating `clientId` values
- [x] Distinguish which threats are mitigated directly in this phase versus which are only noted for future stateful coordination or broader infrastructure controls
- [x] Ensure the threat model remains aligned with the anonymous gateway architecture rather than assuming authenticated end-user identity

### 2. Identifier Security Boundary Hardening
- [x] Define strict validation rules for `appId` and `clientId`, including required presence, allowed character set, maximum length, and bounded complexity expectations
- [x] Define canonical normalization rules so logically identical identifiers resolve to the same trusted representation before request context creation, token issuance, telemetry attribution, and rate-limit key construction
- [x] Ensure malformed, excessively long, bypass-oriented, or high-cardinality identifiers are hard rejected rather than accepted as-is
- [x] Validate that identifier handling does not allow attackers to cheaply rotate identities to evade enforcement or explode rate-limit and observability cardinality

### 3. Rate Limiting Strategy for `/auth`
- [x] Define stricter `/auth` rate limits than `/ai` while preserving the existing pluggable rate limiter interface
- [x] Ensure rate limiting uses combined signals such as normalized `clientId` plus network identity context so enforcement remains meaningful under the current anonymous model
- [x] Confirm limit-exceeded behavior is a hard rejection and remains safe under repeated abuse attempts
- [x] Evaluate how rotating IPs or rotating identifiers interact with the current keying strategy and define hardening needed within the existing rate-limiting design

### 4. Request Validation and Input Safety
- [x] Validate `appId` and `clientId` presence, format, normalization, and bounded size at the system boundary before they influence auth issuance or rate limiting
- [x] Ensure invalid identifier values cannot be used to create excessive key cardinality, pollute telemetry dimensions, or bypass enforcement through inconsistent formatting
- [x] Preserve compatibility with the current public request shape while tightening rejection behavior for malformed or unsafe inputs

### 5. Token Issuance Constraints
- [x] Validate that issued tokens remain short-lived and contain only the claims necessary for existing gateway enforcement
- [x] Confirm clients cannot escalate, expand, or modify issued constraints without invalidating the signature
- [x] Ensure issued claims remain aligned with gateway policy defaults and app-scoped enforcement expectations
- [x] Review whether TTL tightening or issuance-side safeguards are needed to reduce abuse exposure while preserving the current lightweight flow

### 6. Replay and Reuse Considerations
- [x] Define acceptable token reuse behavior within the configured token lifetime under the current stateless design
- [x] Ensure existing safeguards such as short TTL, client-bound claims, and signature validation are explicitly validated as the v1 replay posture
- [x] Document that stronger defenses such as one-time-use tokens, revocation, or centralized replay tracking are future optional stateful controls rather than part of this phase

### 7. Distributed Rate Limiting and Serverless Coordination
- [x] Confirm `/auth` abuse protection assumptions remain valid in a distributed/serverless deployment where multiple instances may issue tokens concurrently
- [x] Validate expectations for the external rate-limiting backend planned in separate phases so `/auth` hardening does not rely on in-memory coordination guarantees
- [x] Ensure the plan explicitly distinguishes development/local fallback behavior from production-grade enforcement expectations

### 8. Observability and Monitoring
- [x] Define operational signals for token issuance rate anomalies, repeated `/auth` rejections, and suspicious issuance patterns involving identifier churn
- [x] Ensure observability never logs raw tokens, signing secrets, provider credentials, or unsafe identifier payloads
- [x] Keep observability focused on abuse detection and system operation without introducing user-tracking semantics that conflict with the current anonymous model

### 9. Testing Strategy
- [x] Add tests for stricter `/auth` rate-limit enforcement, malformed identifier rejection, normalization behavior, and bounded identifier constraints
- [x] Add abuse-style tests for burst issuance, repeated token requests, identifier rotation attempts, and repeated rejection scenarios
- [x] Verify token claims remain minimal, signed, short-lived, and bound to the expected identity context
- [x] Preserve integration coverage proving `/auth` hardening does not change the public request/response contract or the downstream `/ai` signed-token flow

## Non-Goals
- Introducing user accounts, user sessions, CAPTCHA, or third-party identity verification systems
- Replacing the shared-secret token signing model or redesigning the overall auth architecture
- Implementing persistent replay tracking, token revocation infrastructure, or long-term identity correlation systems in this phase

## Acceptance Criteria
- [x] `/auth` has a documented v1 abuse model and concrete hardening steps aligned with the anonymous signed-token architecture
- [x] `appId` and `clientId` are treated as security-boundary identifiers with strict validation and canonical normalization that support reliable enforcement
- [x] `/auth` rate limiting is stricter than `/ai`, uses the existing pluggable limiter seam, and hard rejects abusive issuance patterns
- [x] Issued tokens remain short-lived, minimally scoped, signature-protected, and aligned with existing gateway policy constraints
- [x] Observability and tests cover abuse-oriented auth hardening without changing the public gateway contracts or introducing new identity systems
