# Plan: Policy and Enforcement Core

## Objective
Define the central enforcement layer that evaluates hosted AI requests against gateway policy, token claims, app/client context, and configured provider/model restrictions before any upstream execution occurs.

## Customer Value
- Protects hosted usage from unintended cost, misuse, and unsupported requests
- Gives EverGray apps a predictable execution contract regardless of which client initiates the request
- Centralizes safety and allowlist logic so future app-specific controls can be added without changing every endpoint

## Scope Decisions (Locked)
- All enforcement is hard server-side enforcement; advisory-only checks are out of scope for v1
- Token claims and server-side configuration must both be considered, with the effective policy always taking the stricter result
- The MVP should support provider abstraction from the start, but only needs one concrete provider implementation initially
- `appId` is multi-app enforcement context and must flow through policy evaluation even though it is not a secret in v1

## Prerequisites
- `docs/system-spec.md`
- `.plans/01-serverless-service-foundation.md`
- `.plans/02-auth-token-issuance.md`

## Implementation Checklist

### 1. Policy Configuration Model
- [ ] Define policy contracts for allowed providers, allowed models, default model selection, and maximum output/token limits
- [ ] Define how global defaults and future app-specific overrides can coexist without complicating the MVP path
- [ ] Ensure policy configuration can be loaded centrally and evaluated consistently in stateless request handlers

### 2. Request Validation and Normalization
- [ ] Define the normalized hosted AI request shape expected by `/ai`
- [ ] Validate required fields, unsupported options, malformed payloads, and unsafe request sizes before execution begins
- [ ] Normalize request metadata so downstream provider execution receives a predictable structure regardless of client input variations

### 3. Constraint Evaluation
- [ ] Enforce token-derived limits such as `maxTokens`, expiration, and optional model allowlists
- [ ] Enforce gateway-side provider/model allowlists and reject unsupported combinations explicitly
- [ ] Resolve the effective model/provider choice, including the v1 default-model pathway when the client omits a selection

### 4. Rejection Semantics
- [ ] Define stable rejection categories for invalid auth, policy violations, unsupported models/providers, and request-size violations
- [ ] Ensure rejection responses are safe, consistent, and observable without disclosing sensitive internal policy details
- [ ] Establish how enforcement failures are logged and surfaced to metrics systems for abuse analysis

### 5. Enforcement-Oriented Test Coverage
- [ ] Verify valid requests are normalized into provider-ready execution intent only when all constraints pass
- [ ] Verify invalid model/provider selections and excessive token requests are hard rejected
- [ ] Verify stricter server-side limits override broader client intent cleanly and predictably

## Acceptance Criteria
- [ ] The gateway has a reusable enforcement layer that evaluates AI requests before any provider call is attempted
- [ ] Token constraints and server-side policy combine into a predictable effective-allowance model
- [ ] Unsupported or excessive requests are rejected with stable, safe error behavior
- [ ] Default-model behavior is centralized rather than duplicated in route handlers or provider adapters
- [ ] The enforcement layer is portable, testable, and ready for future per-app policy extensions
