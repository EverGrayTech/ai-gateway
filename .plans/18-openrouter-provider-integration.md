# Plan: OpenRouter Provider Integration

## Objective
Implement a real OpenRouter upstream provider executor behind the existing `ProviderExecutorPort` so the gateway can execute OpenRouter-hosted requests while preserving the normalized gateway request/response contracts, gateway-wide streaming semantics, and current enforcement boundaries.

## Customer Value
- Enables real OpenRouter-backed execution through the gateway instead of placeholder provider behavior
- Preserves one stable `/ai` client contract while containing aggregator-specific request, response, and streaming behavior entirely within the provider executor
- Strengthens gateway governance by proving an aggregator-backed provider can integrate cleanly without weakening policy enforcement or leaking routed-upstream semantics

## Scope Decisions (Locked)
- This phase builds on `.plans/11-openrouter-provider-support.md` and replaces the current mock-style OpenRouter executor behavior with real upstream integration
- The public `/ai` request and response contracts must remain unchanged
- The gateway’s normalized streaming contract and lifecycle semantics remain authoritative and must not be reshaped around OpenRouter or routed-upstream event behavior
- The canonical gateway content field remains `input`; OpenRouter-specific request construction must stay inside the executor boundary without expanding the gateway contract
- Model allowlisting and provider constraints remain enforced by gateway policy and auth layers, not by OpenRouter-specific passthrough logic
- The implementation must remain stateless, serverless-compatible, and must not turn OpenRouter into a generic arbitrary passthrough layer

## Prerequisites
- `docs/system-spec.md`
- `docs/development.md`
- `.plans/11-openrouter-provider-support.md`
- `.plans/12-openai-real-upstream-integration.md`
- `.plans/13-streaming-validation-and-hardening.md`

## Implementation Checklist

### 1. Provider Overview (Context Only)
- [x] Document the OpenRouter execution and streaming API surface relevant to hosted gateway execution without exposing aggregator-native semantics beyond the executor boundary
- [x] Identify notable differences from direct-provider integrations, including routed model identifiers, response metadata, and stream event behavior that require adaptation internally
- [x] Keep the overview contextual and avoid redefining gateway-level contracts around aggregator behavior

### 2. Request Mapping
- [x] Define the mapping from canonical gateway input (`provider`, `model`, `input`, `stream`, `maxOutputTokens`) into the OpenRouter request format
- [x] Document how gateway `input` is represented upstream without expanding or reshaping the gateway-level request contract
- [x] Ensure OpenRouter request construction remains controlled and fully contained inside the executor rather than broadening passthrough behavior

### 3. Response Normalization
- [x] Define how OpenRouter non-streaming responses normalize into the existing gateway success shape (`provider`, `model`, `output`, `usage`)
- [x] Handle OpenRouter- and routed-upstream-specific response structures internally so only normalized output text and usage metadata leave the executor
- [x] Normalize usage on a best-effort basis when OpenRouter supplies upstream usage data

### 4. Streaming Adaptation
- [x] Adapt OpenRouter streaming behavior into the existing normalized `AsyncIterable<{ event?, data }>` gateway contract
- [x] Ensure incremental chunk delivery, correct ordering, and provider-agnostic lifecycle behavior for start, chunk emission, completion, and error handling
- [x] Keep OpenRouter- or routed-upstream-specific event semantics contained within the executor and avoid introducing new streaming abstractions

### 5. Error Normalization
- [x] Map OpenRouter and routed-upstream failures into the existing gateway upstream error model with safe codes, messages, and retryability classification where applicable
- [x] Prevent leakage of raw OpenRouter payloads, routed-upstream internals, headers, or credentials in errors or logs
- [x] Ensure provider mismatch and model mismatch behavior remains compatible with the current provider execution contract

### 6. Configuration and Credentials
- [x] Define OpenRouter configuration requirements and credential usage through existing environment/config seams
- [x] Ensure OpenRouter credentials remain server-side only and are never exposed through client-visible surfaces
- [x] Avoid introducing OpenRouter-specific configuration logic into core gateway service, policy, or runtime layers

### 7. Integration with Existing System
- [x] Confirm OpenRouter integration remains compatible with current policy enforcement, model allowlisting, auth/token flow, rate limiting, and runtime service behavior
- [x] Ensure the OpenRouter executor remains fully interchangeable with other providers through `ProviderExecutorPort`
- [x] Preserve gateway governance so OpenRouter availability does not weaken provider selection or broaden hosted model access beyond current policy constraints

### 8. Testing Strategy
- [x] Add unit tests for OpenRouter request mapping, response normalization, usage handling, and error normalization
- [x] Add streaming tests covering OpenRouter chunk handling, termination behavior, and streaming failure scenarios
- [x] Add integration-style tests using mocked OpenRouter responses and stream payloads without depending on live OpenRouter APIs
- [x] Preserve existing gateway contract tests to ensure OpenRouter integration does not alter the client-facing `/ai` shape

## Non-Goals
- Redesigning the provider abstraction, execution flow, or gateway streaming contract
- Introducing OpenRouter-specific logic into gateway service, policy, auth, or runtime layers
- Allowing arbitrary passthrough routing, cross-provider fallback behavior, or cost optimization logic

## Acceptance Criteria
- [x] OpenRouter has a real upstream executor behind `ProviderExecutorPort`
- [x] OpenRouter request/response and streaming behavior are normalized into existing gateway contracts without aggregator-specific leakage
- [x] OpenRouter failures are translated into the current gateway upstream error model safely and consistently
- [x] Existing auth, policy, rate-limiting, and runtime layers preserve their current contract while OpenRouter support becomes real
