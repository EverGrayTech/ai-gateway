# Plan: Gemini Provider Support

## Objective
Add Gemini as a supported hosted provider behind the gateway provider abstraction while preserving the stateless serverless deployment model, normalized request and response contracts, and gateway-controlled enforcement behavior.

## Customer Value
- Expands the hosted provider catalog available to EverGray Tech applications through one backend integration surface
- Allows downstream clients to access approved Gemini-hosted models without embedding provider-specific logic or credentials
- Strengthens the long-term gateway architecture by validating support for another major provider with distinct API semantics

## Scope Decisions (Locked)
- Gemini support must operate within the existing serverless HTTP gateway architecture and may not assume persistent process state or provider sessions across requests
- Provider credentials and provider-specific configuration remain server-side only and must not leak into client-visible surfaces or logs
- The gateway continues to expose one normalized `/ai` contract instead of reflecting Gemini-native payload shapes directly
- Hosted access must remain limited to explicitly approved Gemini models and gateway policy constraints rather than unrestricted provider passthrough
- Streaming support must stay aligned with the normalized gateway streaming model and respect target-runtime constraints documented for serverless delivery

## Prerequisites
- `docs/system-spec.md`
- `.plans/01-serverless-service-foundation.md`
- `.plans/03-policy-and-enforcement-core.md`
- `.plans/05-provider-execution-and-streaming.md`
- `.plans/06-end-to-end-gateway-api.md`

## Implementation Checklist

### 1. Provider Configuration and Credentials
- [x] Extend environment and configuration contracts to support Gemini credentials and any required hosted endpoint configuration
- [x] Preserve startup-time validation so invalid or incomplete Gemini configuration fails safely before request handling
- [x] Keep Gemini configuration behind the existing configuration seam so runtime portability is preserved

### 2. Gemini Provider Metadata and Registration
- [x] Add Gemini provider metadata and a hosted model allowlist suitable for policy enforcement and default-provider selection logic
- [x] Register Gemini within the provider execution surface without changing the public gateway request contract
- [x] Ensure provider selection remains explicit and predictable when multiple hosted providers are available

### 3. Request Execution and Response Normalization
- [x] Implement a Gemini provider executor that maps normalized gateway requests into provider-safe upstream calls
- [x] Normalize Gemini completion responses into the gateway success shape, including usage data when the provider supplies it
- [x] Translate Gemini-specific failures into safe, consistent gateway error categories without exposing provider-sensitive details

### 4. Streaming Behavior
- [x] Adapt Gemini streaming behavior into the normalized gateway event stream expected by downstream clients
- [x] Verify streaming remains incremental through the current serverless abstraction rather than buffering the full completion first
- [x] Document or enforce gateway-safe handling when runtime or provider behavior limits streaming fidelity

### 5. Test Coverage and Contract Validation
- [x] Add provider tests covering Gemini success paths, rejected provider/model mismatches, and safe failure translation
- [x] Extend config and integration tests where needed to validate Gemini credential loading and hosted execution wiring
- [x] Ensure Gemini support preserves coverage requirements and does not regress current hosted gateway behavior

## Acceptance Criteria
- [x] Gemini can be configured and executed as a hosted provider using server-side credentials only
- [x] Approved Gemini models are available through the normalized `/ai` contract without client-visible provider-specific reshaping
- [x] Gemini standard and streaming executions are supported through safe gateway normalization
- [x] Gemini upstream failures surface through consistent gateway-safe errors
- [x] The provider architecture remains extensible and serverless-portable after Gemini support is introduced
