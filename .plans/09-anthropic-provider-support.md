# Plan: Anthropic Provider Support

## Objective
Add Anthropic as a supported hosted provider behind the existing gateway provider abstraction while preserving the normalized `/ai` contract, server-side credential handling, and serverless-safe streaming behavior.

## Customer Value
- Expands hosted model coverage for downstream EverGray Tech applications without requiring client-side provider-specific integration work
- Preserves one consistent gateway contract while enabling Anthropic-backed completions through approved hosted models
- Reduces future provider lock-in by proving the current abstraction can support another first-party provider cleanly

## Scope Decisions (Locked)
- Anthropic support must fit the current stateless serverless HTTP deployment model and must not depend on long-lived in-memory state
- Anthropic credentials must remain server-side only and must never be exposed through client payloads, responses, or logs
- The gateway public request and response contract must remain normalized rather than adopting Anthropic-native request or response shapes
- Hosted execution must remain constrained by explicit provider and model allowlisting instead of permitting arbitrary upstream passthrough
- Streaming behavior must remain compatible with the current serverless delivery model and document any runtime limitations through existing gateway patterns rather than provider-specific client contracts

## Prerequisites
- `docs/system-spec.md`
- `.plans/01-serverless-service-foundation.md`
- `.plans/03-policy-and-enforcement-core.md`
- `.plans/05-provider-execution-and-streaming.md`
- `.plans/06-end-to-end-gateway-api.md`

## Implementation Checklist

### 1. Provider Configuration and Credentials
- [x] Extend gateway environment contracts to support Anthropic credential inputs and any provider-specific base configuration needed for hosted execution
- [x] Preserve fast-fail configuration validation and production-safe requirements for server-side provider credentials
- [x] Keep Anthropic configuration isolated behind existing config and adapter boundaries so the core service remains portable

### 2. Anthropic Provider Metadata and Registration
- [x] Add Anthropic provider metadata and an explicit hosted model allowlist aligned with gateway policy expectations
- [x] Register Anthropic within the provider surface without changing the normalized public API contract
- [x] Ensure default-provider behavior and provider selection logic remain explicit and predictable when Anthropic is available

### 3. Request Execution and Response Normalization
- [x] Implement an Anthropic provider executor that accepts normalized gateway input and constructs provider-safe upstream requests
- [x] Map Anthropic responses into the existing normalized success shape, including approximate usage metadata when available
- [x] Translate Anthropic-originated failures into safe gateway errors without leaking provider internals, credentials, or unnecessary raw payload details

### 4. Streaming Behavior
- [x] Support Anthropic streaming through the normalized gateway streaming contract rather than exposing provider-native event semantics directly to clients
- [x] Verify that streaming remains incremental and serverless-compatible within the current runtime abstraction
- [x] Ensure unsupported or degraded runtime streaming behavior is handled through documented gateway-safe fallback expectations

### 5. Test Coverage and Contract Validation
- [x] Add provider-level tests for Anthropic success, provider mismatch, model mismatch, and safe error translation behavior
- [x] Extend configuration and integration-oriented tests where needed to cover Anthropic credential loading and hosted execution wiring
- [x] Preserve repository coverage and verify Anthropic support does not regress existing OpenAI gateway behavior

## Acceptance Criteria
- [x] Anthropic can be configured as a hosted provider using server-side-only credentials
- [x] Approved Anthropic models can be executed through the normalized `/ai` contract without changing client integration shape
- [x] Anthropic standard and streaming responses are translated into safe gateway behavior
- [x] Anthropic failures are normalized into consistent gateway-safe errors
- [x] The provider abstraction remains portable and extensible after Anthropic support is added
