# Plan: End-to-End Gateway API

## Objective
Assemble the `/auth` and `/ai` endpoints into a fully integrated serverless gateway flow with end-to-end validation, hosted execution, rejection behavior, and integration tests covering the MVP acceptance criteria.

## Customer Value
- Proves that multiple EverGray apps can use one centralized hosted AI service through a consistent interface
- Validates that security, enforcement, and execution layers work together instead of only in isolation
- Reduces integration risk for downstream clients by locking the MVP API behavior through tests

## Scope Decisions (Locked)
- This plan focuses on integrating the already-defined subsystems into the public gateway surface rather than introducing new core policy concepts
- The service must support both token issuance and hosted AI execution in one stateless deployment unit
- Rejection cases are part of the API contract and must be verified as carefully as success paths
- BYOK remains out of scope for gateway execution because the gateway is only responsible for the hosted path

## Prerequisites
- `docs/system-spec.md`
- `.plans/01-serverless-service-foundation.md`
- `.plans/02-auth-token-issuance.md`
- `.plans/03-policy-and-enforcement-core.md`
- `.plans/04-rate-limiting-and-observability.md`
- `.plans/05-provider-execution-and-streaming.md`

## Implementation Checklist

### 1. Public Endpoint Assembly
- [ ] Wire `/auth` into the shared request pipeline with request validation, rate limiting, token issuance, and observability
- [ ] Wire `/ai` into the shared request pipeline with token verification, policy enforcement, provider execution, and observability
- [ ] Ensure route assembly preserves the portability of the serverless adapter rather than embedding core logic in route files

### 2. Hosted Execution Flow Validation
- [ ] Verify the happy path from token issuance through successful hosted execution
- [ ] Verify default-model execution behavior when clients omit an explicit model selection
- [ ] Verify both non-streaming and streaming `/ai` requests follow the intended pipeline and response contract

### 3. Rejection and Failure Scenarios
- [ ] Verify missing-token, invalid-signature, expired-token, malformed-request, unsupported-model, and rate-limited scenarios
- [ ] Verify provider failures surface through safe, normalized gateway errors
- [ ] Ensure rejected requests do not trigger unnecessary upstream provider work

### 4. Multi-App Context Handling
- [ ] Verify `appId` is required and flows through the request lifecycle as enforcement and observability context
- [ ] Verify `clientId` is required where expected and participates in auth and abuse-prevention behavior
- [ ] Ensure the integrated API leaves room for future per-app tuning without breaking the v1 contract

### 5. Integration Test Suite
- [ ] Build integration coverage around the public serverless API surface rather than only internal modules
- [ ] Ensure tests can run deterministically with mocked provider and infrastructure adapters
- [ ] Align integration assertions with the explicit MVP acceptance criteria from the design doc

## Acceptance Criteria
- [ ] Clients can obtain a signed token from `/auth` and use it successfully with `/ai`
- [ ] Invalid, expired, or missing tokens are rejected before hosted execution begins
- [ ] Only allowed models/providers can be used and all hard limits are enforced through the public API surface
- [ ] Streaming responses function through the integrated gateway flow
- [ ] The MVP acceptance criteria are exercised by automated integration coverage
