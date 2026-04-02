# Plan 27: Unified Gateway-Mediated Hosted and BYOK Contract

## Objective
Replace the current hosted-only `/ai` contract with one unified gateway-mediated invocation contract that supports exactly two valid request shapes:

1. **Hosted/default execution** using the gateway’s configured hosted default when `provider`, `model`, and `X-EG-AI-Provider-Credential` are all absent
2. **Explicit BYOK execution** when `provider`, `model`, and `X-EG-AI-Provider-Credential` are all present, causing the gateway to invoke that exact provider/model using that exact raw per-request credential without persisting it

The gateway must reject every mixed or partial combination as a structured validation error, must not introduce a separate `mode` field, and must keep all execution gateway-mediated under one `/ai` surface.

## Deployment and Hosting Constraint Check
- The gateway is a stateless serverless HTTP service running behind a serverless adapter.
- Request-shape validation, provider execution routing, and credential handling must remain portable core service logic.
- Browser-specific custom-header allowance belongs at the serverless adapter boundary.
- Because the runtime is stateless, BYOK credentials may only be handled as request-scoped transient inputs and must never be persisted or emitted through logs, telemetry, or error surfaces.

## Scope Decisions (Locked)
- Support exactly two valid `/ai` request shapes and reject all others.
- Do not introduce a `mode` field.
- Do not preserve the prior documented direct-provider BYOK bypass model.
- Do not add server-side persistence, storage, caching, or profile binding for raw BYOK credentials.
- Keep hosted/default execution working for the zero-setup case where `provider`, `model`, and the BYOK credential header are omitted.
- Reuse the existing provider executors for OpenAI, Anthropic, Gemini, and OpenRouter by adding request-scoped credential override capability rather than building a separate BYOK executor stack.
- Preserve the existing normalized response envelope unless a contract change is required to express invalid request shapes cleanly.

## Required Request Contract

### Valid shape 1: Hosted/default request
Required characteristics:
- `provider` absent
- `model` absent
- `X-EG-AI-Provider-Credential` absent
- `input` required
- `stream` optional
- `maxOutputTokens` optional
- gateway selects the configured hosted default provider/model

### Valid shape 2: Explicit BYOK request
Required characteristics:
- `provider` present
- `model` present
- `X-EG-AI-Provider-Credential` present
- `input` required
- `stream` optional
- `maxOutputTokens` optional
- gateway invokes the exact requested provider/model using the raw per-request credential from the header

### Invalid combinations to reject
The gateway must return structured validation errors for all partial or mixed shapes, including:
- provider only
- model only
- credential only
- provider + model without credential
- provider + credential without model
- model + credential without provider

## Implementation Checklist

### 1. Contract and Validation Layer
- [x] Update the `/ai` request contract to formalize the two allowed request shapes and eliminate implicit mixed-shape behavior
- [x] Add request-header extraction for `X-EG-AI-Provider-Credential` at the service boundary
- [x] Introduce request-shape normalization that classifies requests as hosted-default, explicit-BYOK, or invalid
- [x] Reject all invalid partial/mixed combinations before provider execution begins
- [x] Keep normalized internal execution inputs separate from raw request payloads and headers

### 2. Runtime and Service Routing
- [x] Refactor `/ai` handling so routing is derived solely from request shape rather than a `mode` field or legacy branching
- [x] Preserve hosted/default behavior for the no-provider/no-model/no-credential case
- [x] Route explicit BYOK requests through the gateway using the exact provided provider/model and request-scoped credential
- [x] Keep hosted-default policy/default resolution separate from explicit-BYOK execution evaluation so the two shapes do not bleed into one another
- [x] Preserve existing success and streaming response behavior where the new contract does not require a change

### 3. Provider Executor Changes
- [x] Extend the provider execution contract to support request-scoped credential overrides
- [x] Update OpenAI execution to prefer request-scoped credentials for explicit BYOK while retaining env-configured credentials for hosted/default execution
- [x] Update Anthropic execution to prefer request-scoped credentials for explicit BYOK while retaining env-configured credentials for hosted/default execution
- [x] Update Gemini execution to prefer request-scoped credentials for explicit BYOK while retaining env-configured credentials for hosted/default execution
- [x] Update OpenRouter execution to prefer request-scoped credentials for explicit BYOK while retaining env-configured credentials for hosted/default execution
- [x] Ensure request-scoped credentials are never retained beyond the active execution call

### 4. Structured Error Semantics
- [x] Define deterministic structured validation errors for each invalid partial or mixed request shape
- [x] Ensure explicit BYOK contract violations fail at the request boundary rather than surfacing as downstream provider misconfiguration errors
- [x] Preserve provider/upstream failures as structured provider-category errors once a valid explicit-BYOK request reaches executor logic
- [x] Keep error details free of raw credential material

### 5. Observability and Security Hardening
- [x] Extend redaction rules so `X-EG-AI-Provider-Credential` is always treated as sensitive
- [x] Ensure logs, telemetry, and normalized error responses never expose raw BYOK credentials
- [x] Keep raw provider credentials out of request context summaries, debug logs, and provider failure metadata
- [x] Preserve the stateless, no-persistence handling model for request-scoped credentials

### 6. Serverless Adapter and CORS
- [x] Update adapter CORS allow-headers behavior to permit `x-eg-ai-provider-credential`
- [x] Preserve preflight, standard-response, streaming-response, and handled-error CORS behavior after the custom header is added
- [x] Keep browser-specific header handling isolated to the adapter boundary rather than the core service layer

### 7. Test Coverage
- [x] Add integration tests for hosted/default success using omitted `provider`, omitted `model`, and absent BYOK credential header
- [x] Add integration tests for explicit BYOK success using `provider`, `model`, and `X-EG-AI-Provider-Credential`
- [x] Add coverage for each invalid partial/mixed request-shape rejection
- [x] Add tests ensuring an otherwise explicit provider/model request fails validation when the BYOK credential header is missing or empty
- [x] Add tests proving BYOK credential redaction in logs/telemetry/error surfaces
- [x] Add provider-level tests proving request-scoped credential overrides work for OpenAI, Anthropic, Gemini, and OpenRouter
- [x] Update serverless adapter tests for browser preflight and allowed-header behavior with the custom credential header

### 8. Documentation Updates
- [x] Update `docs/consumption-guide.md` to describe the single gateway-mediated invocation model and the two valid `/ai` request shapes
- [x] Update `docs/system-spec.md` to reflect request-scoped BYOK credential support and the removal of the direct-provider BYOK bypass assumption
- [x] Update any README or maintainer-facing language that still describes BYOK as direct-provider bypass
- [x] Ensure repository documentation consistently states that raw BYOK credentials are forwarded per request only, never persisted, and always redacted from observability surfaces

## Risks and Ordering Constraints

### Highest-risk areas
- The `/ai` service path currently assumes all requests are hosted and bearer-token-authenticated, so request-shape-driven routing must be introduced carefully.
- Provider executor overrides must be designed so request-scoped credentials do not leak into long-lived executor state.
- Header ingestion and redaction must land together to avoid unsafe intermediate behavior.
- Existing documentation explicitly describes the opposite BYOK model and must be reconciled in the same effort.

### Recommended implementation order
1. Contract and validation layer
2. Runtime and service routing
3. Provider executor request-scoped credential support
4. Structured invalid-shape error behavior
5. Observability and security hardening
6. Serverless adapter and CORS updates
7. Tests
8. Docs

## Non-Goals
- Introducing a `mode` field
- Preserving external-customer BYOK-direct architecture
- Persisting BYOK credentials server-side
- Adding billing, quota accounting, account linking, or provider-optimization logic
- Introducing additional execution modes beyond the two allowed request shapes

## Acceptance Criteria
- [x] `/ai` supports exactly two valid request shapes and rejects all mixed/partial variants as structured validation errors
- [x] Hosted/default execution works when `provider`, `model`, and the BYOK credential header are all absent
- [x] Explicit BYOK execution works for OpenAI, Anthropic, Gemini, and OpenRouter using `X-EG-AI-Provider-Credential` with no server-side persistence
- [x] Provider executors use request-scoped credentials for explicit BYOK and env-configured credentials for hosted/default execution
- [x] Raw BYOK credentials are never exposed in logs, telemetry, or error surfaces
- [x] Browser clients can send `X-EG-AI-Provider-Credential` through the serverless adapter
- [x] Tests and docs fully reflect the new single gateway-mediated architecture
