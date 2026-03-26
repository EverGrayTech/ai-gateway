# Plan: Anthropic Provider Integration

## Objective
Implement a real Anthropic upstream provider executor behind the existing `ProviderExecutorPort` so the gateway can execute Anthropic-hosted requests while preserving the normalized gateway request/response contracts, gateway-wide streaming semantics, and existing auth, policy, and runtime boundaries.

## Customer Value
- Enables real Anthropic-hosted execution through the gateway instead of placeholder provider behavior
- Preserves one stable client-facing `/ai` contract while adapting Anthropic-specific API semantics internally
- Strengthens the gateway architecture by proving another provider can integrate cleanly without contract drift or leakage of provider-specific behavior

## Scope Decisions (Locked)
- This phase builds on `.plans/09-anthropic-provider-support.md` and replaces the current mock-style Anthropic executor behavior with real upstream integration
- The public `/ai` request and response contracts must remain unchanged
- The gateway’s normalized streaming contract and lifecycle semantics are already gateway-level concerns and must not be redefined by Anthropic-specific behavior
- The canonical gateway content field remains `input`; any Anthropic-native request shaping must stay fully inside the executor boundary
- Model allowlisting, token constraints, and policy decisions remain enforced by existing gateway policy and auth layers rather than by Anthropic-specific logic
- The implementation must remain stateless and serverless-compatible, with provider-specific concerns isolated to the executor layer

## Prerequisites
- `docs/system-spec.md`
- `docs/development.md`
- `.plans/09-anthropic-provider-support.md`
- `.plans/12-openai-real-upstream-integration.md`
- `.plans/13-streaming-validation-and-hardening.md`

## Implementation Checklist

### 1. Provider Overview (Context Only)
- [x] Document the Anthropic execution and streaming API surface relevant to hosted request execution without exposing provider-native semantics beyond the executor boundary
- [x] Identify notable differences from OpenAI that require adaptation internally, such as request/response nesting, streaming event shapes, and usage metadata shape
- [x] Ensure the overview remains contextual only and does not redefine any gateway-level contract behavior

### 2. Request Mapping
- [x] Define the mapping from canonical gateway input (`provider`, `model`, `input`, `stream`, `maxOutputTokens`) into the Anthropic request body
- [x] Document how gateway `input` is represented in Anthropic-native request structure without introducing new gateway-level input fields
- [x] Keep all request construction provider-specific and fully contained within the Anthropic executor

### 3. Response Normalization
- [x] Define how Anthropic non-streaming responses map back into the normalized gateway success shape (`provider`, `model`, `output`, `usage`)
- [x] Handle Anthropic-specific content structures internally so only normalized output text and usage data leave the executor
- [x] Normalize usage metadata on a best-effort basis when Anthropic supplies it

### 4. Streaming Adaptation
- [x] Adapt Anthropic streaming behavior into the existing normalized `AsyncIterable<{ event?, data }>` gateway contract
- [x] Ensure incremental chunk delivery, correct ordering, and provider-agnostic lifecycle behavior for chunk emission, completion, and error handling
- [x] Keep Anthropic-native stream event semantics fully contained within the executor and avoid introducing new streaming abstractions

### 5. Error Normalization
- [x] Map Anthropic-specific failures into the existing gateway upstream error model with safe messages, codes, and retryability classification where applicable
- [x] Prevent leakage of raw Anthropic payloads, headers, credentials, or unnecessary internal details in errors or logs
- [x] Ensure provider mismatch and model mismatch behavior remains compatible with the current provider execution flow

### 6. Configuration and Credentials
- [x] Define Anthropic configuration requirements and credential usage through existing environment/config seams
- [x] Ensure Anthropic credentials remain server-side only and are never exposed through client-facing surfaces
- [x] Avoid introducing Anthropic-specific configuration concerns into core gateway service, policy, or runtime layers

### 7. Integration with Existing System
- [x] Confirm Anthropic integration remains compatible with existing policy enforcement, model allowlisting, rate limiting, auth/token flow, and runtime service behavior
- [x] Ensure the Anthropic executor remains interchangeable with other providers through `ProviderExecutorPort`
- [x] Preserve serverless compatibility and gateway-level streaming semantics without adding provider-specific branching to shared layers

### 8. Testing Strategy
- [x] Add unit tests for Anthropic request mapping, response normalization, usage handling, and error normalization
- [x] Add streaming tests covering chunk handling, termination behavior, and failure scenarios for Anthropic stream adaptation
- [x] Add integration-style tests using mocked Anthropic responses and streaming payloads without depending on live Anthropic APIs
- [x] Preserve existing gateway contract tests to ensure Anthropic integration does not expand or reshape the client-facing API

## Non-Goals
- Redesigning the provider abstraction, gateway execution flow, or gateway-wide streaming contract
- Introducing Anthropic-specific logic into gateway service, policy, auth, or runtime layers
- Implementing cross-provider routing, fallback, retries, or cost optimization behavior

## Acceptance Criteria
- [x] Anthropic has a real upstream executor behind `ProviderExecutorPort`
- [x] Anthropic request/response and streaming behavior are fully normalized into existing gateway contracts without leaking provider-specific semantics
- [x] Anthropic errors are translated into the current gateway upstream error model safely and consistently
- [x] Existing auth, policy, rate-limiting, and runtime layers remain unchanged in public behavior while Anthropic support becomes real
