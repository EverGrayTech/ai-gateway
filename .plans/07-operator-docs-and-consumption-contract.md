# Plan: Operator Docs and Consumption Contract

## Objective
Document the operational setup, downstream usage contract, and hosted-path boundaries for `@evergraytech/ai-gateway` so maintainers and consuming apps can deploy, configure, and integrate the MVP safely.

## Customer Value
- Makes it easier for EverGray Tech teams to adopt the gateway without reverse-engineering the service from source code
- Reduces operational mistakes around secrets, environment setup, and hosted-versus-BYOK responsibilities
- Creates a clear contract that downstream apps can build against with confidence

## Scope Decisions (Locked)
- Documentation must reflect the actual integrated MVP behavior rather than aspirational future architecture
- The deployment target is serverless HTTP, so operator guidance must explicitly cover runtime limitations and assumptions relevant to that model
- The gateway contract only covers the hosted path in v1; BYOK remains a client-side bypass mode documented as out of gateway scope
- v1 documentation should focus on maintainers and consuming applications, not end-user dashboards or billing workflows

## Prerequisites
- `docs/system-spec.md`
- `.plans/01-serverless-service-foundation.md`
- `.plans/02-auth-token-issuance.md`
- `.plans/03-policy-and-enforcement-core.md`
- `.plans/04-rate-limiting-and-observability.md`
- `.plans/05-provider-execution-and-streaming.md`
- `.plans/06-end-to-end-gateway-api.md`

## Implementation Checklist

### 1. Operator Configuration Documentation
- [x] Document required environment variables, secret-management expectations, and production-versus-development configuration differences
- [x] Document serverless deployment assumptions, including statelessness and any streaming/runtime caveats maintainers must understand
- [x] Document external adapter expectations for rate limiting, telemetry, and provider credentials

### 2. Consumer Integration Contract
- [x] Document the `/auth` and `/ai` request/response expectations for downstream clients
- [x] Document the required use of `appId`, persistent `clientId`, and signed-token handling in the hosted path
- [x] Clarify hosted-path responsibilities versus BYOK bypass behavior so client apps know when the gateway is involved

### 3. Enforcement and Failure Behavior Guidance
- [x] Document token expiration expectations, rate-limit behavior, and hard rejection semantics
- [x] Document model/provider restriction behavior and default-model expectations for v1
- [x] Provide safe guidance for handling retries, rejected requests, and provider-originated failures in client applications

### 4. Development and Testing Guidance
- [x] Document local development flows that do not require full production infrastructure choices to be finalized
- [x] Document how to run tests, mock provider execution, and validate streaming behavior during development
- [x] Align maintainer workflow guidance with the repository standards and completed implementation plans

### 5. Final Documentation Consistency Review
- [x] Ensure README and docs entries point to the gateway’s final MVP contract consistently
- [x] Remove ambiguity between current capabilities and future extensions called out in the design material
- [x] Verify documentation language does not imply unsupported v1 features such as billing, user accounts, or advanced routing

## Acceptance Criteria
- [x] Maintainers have clear operator guidance for configuring and deploying the serverless MVP safely
- [x] Consuming apps have a clear contract for obtaining tokens and executing hosted AI requests through the gateway
- [x] Documentation clearly distinguishes hosted gateway responsibilities from BYOK bypass behavior
- [x] Enforcement behavior, runtime constraints, and local-development expectations are documented without ambiguity
- [x] Repository-facing docs consistently reflect the implemented MVP rather than future-only capabilities
