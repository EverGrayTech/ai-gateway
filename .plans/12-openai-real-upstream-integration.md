# Plan: OpenAI Real Upstream Integration

## Objective
Replace the current mock OpenAI provider executor with a real OpenAI Responses API integration that preserves the normalized gateway contract, server-side enforcement boundaries, and serverless-safe support for both standard and streaming execution.

## Customer Value
- Enables real hosted OpenAI execution through the gateway instead of placeholder behavior
- Preserves one stable client contract for both JSON and streaming responses while hiding provider-specific API details
- Keeps provider credentials and provider-specific failures behind the gateway’s existing security and policy boundaries

## Scope Decisions (Locked)
- This phase targets OpenAI only and uses the OpenAI Responses API (`/v1/responses`) as the canonical upstream surface
- The public `/ai` request and response contracts must remain unchanged for downstream clients
- The gateway must retain `input` as its only canonical request content field; provider-specific request construction must occur behind the executor boundary and must not introduce a parallel `prompt` contract
- Existing auth, policy, and rate-limit enforcement in the gateway must remain the controlling path before provider execution occurs
- The `ProviderExecutorPort` abstraction must remain intact so future provider implementations continue to fit the same runtime seam
- Streaming completion, termination, and mid-stream failure handling must align with a provider-agnostic gateway streaming contract; the OpenAI work may adapt into that contract but must not define provider-specific streaming semantics that become the de facto standard for future providers
- The deployment target remains stateless serverless HTTP, so streaming design must work within runtimes that support incremental SSE delivery and must explicitly acknowledge runtime buffering limitations where applicable

## Prerequisites
- `docs/system-spec.md`
- `docs/development.md`
- `.plans/03-policy-and-enforcement-core.md`
- `.plans/05-provider-execution-and-streaming.md`
- `.plans/06-end-to-end-gateway-api.md`

## Implementation Checklist

### 1. OpenAI Configuration and Provider Wiring
- [ ] Confirm the OpenAI executor reads server-side credentials from existing gateway configuration using `OPENAI_API_KEY` and optional `OPENAI_BASE_URL`
- [ ] Preserve production-safe configuration behavior so missing credentials fail safely through existing config and upstream error handling patterns
- [ ] Keep OpenAI registration and metadata aligned with the current provider abstraction without reshaping the runtime service contract

### 2. Gateway-to-OpenAI Request Mapping
- [ ] Define the normalized request mapping from gateway execution input (`provider`, `model`, `input`, `stream`, `maxOutputTokens`) into the OpenAI Responses API request body
- [ ] Document how the gateway’s canonical `input` field is represented in the upstream OpenAI `input` shape without introducing a second canonical content field anywhere in the gateway contract
- [ ] Preserve gateway-owned model governance assumptions so allowlisting remains enforced by token and policy logic before the provider executor is invoked

### 3. OpenAI-to-Gateway Response Normalization
- [ ] Define how non-streaming OpenAI responses map back into the existing gateway success shape (`provider`, `model`, `output`, `usage`)
- [ ] Specify how text output is derived from the OpenAI Responses API response structure when multiple content items or response segments are present
- [ ] Normalize usage metadata into the existing gateway usage contract without exposing unnecessary upstream payload details

### 4. Streaming Flow and SSE Handling
- [ ] Define the upstream streaming request path for OpenAI Responses API with `stream: true`
- [ ] Map OpenAI SSE events into the gateway `AsyncIterable<{ event?, data }>` contract as an implementation of the gateway’s provider-agnostic streaming model while preserving incremental delivery semantics for serverless-compatible runtimes
- [ ] Align chunk handling, completion termination, and mid-stream upstream error behavior with gateway-wide streaming rules so the stream closes predictably without introducing OpenAI-specific semantics that future providers would need to mirror
- [ ] Preserve the current gateway responsibility boundary so runtime adapters continue formatting the final SSE response while the provider executor focuses on normalized stream events

### 5. Error Normalization Strategy
- [ ] Define how OpenAI HTTP and payload-level failures are translated into the gateway upstream error model with safe codes, messages, and retryability assumptions
- [ ] Distinguish request validation failures, authentication/credential failures, rate-limit style upstream failures, and transient upstream availability errors without changing the public gateway error contract
- [ ] Ensure secrets, authorization headers, and raw provider bodies are never surfaced through thrown errors, logs, or client responses

### 6. Testing Strategy
- [ ] Add unit coverage for request mapping, response normalization, usage extraction, and error translation behavior in the OpenAI provider executor
- [ ] Add streaming-focused tests covering incremental chunk forwarding, stream termination, and upstream streaming failure handling
- [ ] Add integration-style tests with mocked OpenAI HTTP responses to verify non-streaming and streaming execution through the provider abstraction without requiring live provider access
- [ ] Preserve existing gateway contract tests to confirm no public `/ai` API shape changes are introduced by the real OpenAI integration

## Non-Goals
- Multi-provider expansion or refactoring beyond the OpenAI implementation needed to preserve existing abstractions
- Cost optimization, advanced token accounting enhancements, or provider-specific response enrichment beyond the current normalized contract
- Advanced retries, provider fallback behavior, or cross-provider failover strategies

## Acceptance Criteria
- [ ] The OpenAI provider executor performs real upstream calls against the OpenAI Responses API using server-side configuration only
- [ ] Non-streaming OpenAI responses are normalized into the current gateway success contract without changing downstream API expectations
- [ ] Streaming OpenAI responses are forwarded through the gateway’s normalized streaming path with defined completion and error behavior
- [ ] OpenAI failures are translated into safe gateway upstream errors without leaking secrets or raw provider internals
- [ ] The existing enforcement and provider abstraction boundaries remain intact after the OpenAI integration is introduced
