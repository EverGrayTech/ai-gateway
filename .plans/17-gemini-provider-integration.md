# Plan: Gemini Provider Integration

## Objective
Implement a real Gemini upstream provider executor behind the existing `ProviderExecutorPort` so the gateway can execute Gemini-hosted requests while preserving the normalized gateway request/response contracts, gateway-wide streaming semantics, and existing auth, policy, and runtime boundaries.

## Customer Value
- Enables real Gemini-hosted execution through the gateway instead of placeholder provider behavior
- Preserves one stable client-facing `/ai` contract while adapting Gemini-specific request, response, and streaming behavior internally
- Strengthens provider portability by proving the gateway can absorb another distinct upstream API shape without client-visible change

## Scope Decisions (Locked)
- This phase builds on `.plans/10-gemini-provider-support.md` and replaces the current mock-style Gemini executor behavior with real upstream integration
- The public `/ai` request and response contracts must remain unchanged
- The gateway’s normalized streaming contract and lifecycle semantics remain provider-agnostic and must not be modified for Gemini-specific behavior
- The canonical gateway content field remains `input`; Gemini-specific request shaping must not create additional gateway-level content fields
- Model allowlisting and request constraints remain the responsibility of existing gateway policy and auth layers rather than Gemini-specific validation logic
- The implementation must remain stateless, serverless-compatible, and isolated to the provider executor boundary

## Prerequisites
- `docs/system-spec.md`
- `docs/development.md`
- `.plans/10-gemini-provider-support.md`
- `.plans/12-openai-real-upstream-integration.md`
- `.plans/13-streaming-validation-and-hardening.md`

## Implementation Checklist

### 1. Provider Overview (Context Only)
- [ ] Document the Gemini execution and streaming API surface relevant to hosted gateway execution without exposing provider-native concepts beyond the executor boundary
- [ ] Identify notable Gemini differences from OpenAI that require adaptation internally, such as request content structure, response nesting, and streaming event framing
- [ ] Keep the overview contextual and avoid redefining gateway-level semantics through provider description

### 2. Request Mapping
- [ ] Define the mapping from canonical gateway input (`provider`, `model`, `input`, `stream`, `maxOutputTokens`) into Gemini-native request shape
- [ ] Document how gateway `input` is represented upstream without expanding the gateway-level request contract
- [ ] Ensure all Gemini-specific request shaping remains fully contained inside the executor

### 3. Response Normalization
- [ ] Define how Gemini non-streaming responses normalize into the existing gateway success shape (`provider`, `model`, `output`, `usage`)
- [ ] Handle Gemini-specific response structures internally so only normalized output text and usage metadata leave the executor
- [ ] Normalize usage on a best-effort basis where Gemini supplies token or usage metadata

### 4. Streaming Adaptation
- [ ] Adapt Gemini streaming behavior into the existing normalized `AsyncIterable<{ event?, data }>` gateway contract
- [ ] Ensure incremental chunk delivery, correct ordering, and provider-agnostic lifecycle handling for emission, completion, and error cases
- [ ] Keep Gemini-native streaming details contained within the executor and avoid introducing new streaming abstractions or gateway branching

### 5. Error Normalization
- [ ] Map Gemini-specific error conditions into the existing gateway upstream error model with safe error codes, messages, and retryability classification where applicable
- [ ] Prevent leakage of raw Gemini payloads, headers, or credentials in thrown errors, logs, or client responses
- [ ] Ensure provider mismatch and model mismatch behavior remains compatible with current provider execution routing

### 6. Configuration and Credentials
- [ ] Define Gemini configuration requirements and credential usage through existing environment/config seams
- [ ] Ensure Gemini credentials remain server-side only and never leak into client-visible surfaces
- [ ] Avoid introducing Gemini-specific configuration behavior into core gateway layers

### 7. Integration with Existing System
- [ ] Confirm Gemini integration remains compatible with current policy enforcement, model allowlisting, auth/token flow, rate limiting, and runtime service handling
- [ ] Ensure the Gemini executor remains interchangeable with other providers through `ProviderExecutorPort`
- [ ] Preserve serverless-safe execution and gateway-level streaming semantics without provider-specific logic escaping the executor boundary

### 8. Testing Strategy
- [ ] Add unit tests for Gemini request mapping, response normalization, usage handling, and error normalization
- [ ] Add streaming tests covering Gemini chunk handling, stream termination, and streaming failure behavior
- [ ] Add integration-style tests using mocked Gemini responses and stream payloads without relying on live Gemini APIs
- [ ] Preserve existing gateway contract tests to ensure Gemini integration does not alter client-facing request or response shape

## Non-Goals
- Redesigning the provider abstraction, execution flow, or streaming model
- Introducing Gemini-specific logic into gateway service, policy, auth, or runtime layers
- Implementing provider routing strategies, retries, fallback logic, or optimization behavior across providers

## Acceptance Criteria
- [ ] Gemini has a real upstream executor behind `ProviderExecutorPort`
- [ ] Gemini request/response and streaming behavior are normalized into the existing gateway contracts without provider-specific leakage
- [ ] Gemini failures are mapped into the current gateway upstream error model safely and consistently
- [ ] Existing auth, policy, rate-limiting, and runtime layers preserve their current contract while Gemini support becomes real
