# Plan: Streaming Validation and Hardening

## Objective
Validate and harden end-to-end streaming behavior using a real upstream provider surface for OpenAI while ensuring the gateway streaming model remains correct, provider-agnostic, and production-safe for stateless serverless HTTP deployment.

## Customer Value
- Improves reliability of real-time AI responses delivered through the gateway under real-world streaming conditions
- Preserves one stable streaming contract for downstream clients even when upstream providers emit different event shapes
- Reduces production risk by validating lifecycle, transport, buffering, disconnect, and observability behavior before broader provider expansion

## Scope Decisions (Locked)
- This phase validates streaming with OpenAI as the concrete upstream execution surface, but any lifecycle semantics clarified here must be defined at the gateway level rather than as OpenAI-specific behavior
- The public `/ai` API shape and client integration contract must remain unchanged
- Provider executors must continue adapting upstream streams into the existing normalized `AsyncIterable<{ event?, data }>` contract
- No new streaming abstractions or architectural redesign may be introduced; work is limited to validation, clarification, and hardening within the current service, provider, and serverless adapter model
- Existing auth, policy, rate-limit, and execution flow boundaries must remain intact
- The deployment target remains stateless serverless HTTP, so the plan must explicitly evaluate platform/runtime buffering and cancellation limitations rather than assuming ideal streaming behavior

## Prerequisites
- `docs/system-spec.md`
- `docs/development.md`
- `.plans/05-provider-execution-and-streaming.md`
- `.plans/06-end-to-end-gateway-api.md`
- `.plans/12-openai-real-upstream-integration.md`

## Implementation Checklist

### 1. Gateway-Wide Streaming Contract Validation
- [x] Validate the existing normalized gateway streaming contract across provider executor, gateway service, serverless adapter, and client-facing SSE behavior
- [x] Clarify only the minimum gateway-wide lifecycle semantics needed for hardening, including stream start, ordered incremental chunk emission, completion/termination, and normalized mid-stream failure behavior
- [x] Ensure the resulting semantics remain provider-agnostic so future providers conform to one gateway contract instead of inheriting OpenAI-shaped rules

### 2. End-to-End Streaming Flow Validation
- [x] Validate real streaming from provider to gateway to client using OpenAI-backed execution or realistic OpenAI-shaped streaming responses
- [x] Verify incremental delivery occurs without unintended full-response buffering across short, long-running, and larger-output streams
- [x] Confirm chunk ordering, completeness, and stable behavior across varying response sizes and durations

### 3. SSE Formatting and Serverless Transport
- [x] Validate that the serverless adapter emits correct `text/event-stream` formatting and headers for browser/EventSource-compatible consumption
- [x] Confirm connection handling and response behavior remain correct within the existing serverless adapter model
- [x] Identify any platform-specific constraints that may affect incremental delivery or connection lifetime in serverless deployment targets

### 4. Stream Lifecycle Semantics
- [x] Define and validate provider-agnostic gateway behavior for stream start, incremental chunk emission, completion, and termination
- [x] Determine whether any final-event guarantees exist today and either validate them or explicitly document the absence of such guarantees without changing the public contract
- [x] Ensure lifecycle behavior remains consistent regardless of upstream provider event shapes once adapted into the normalized gateway stream model

### 5. Mid-Stream Error Handling
- [x] Define expected gateway behavior when upstream streaming fails after partial output has already been emitted
- [x] Ensure mid-stream failures surface in a normalized, client-safe way that does not leak raw provider internals or malformed event payloads
- [x] Validate that partial-stream failure paths close or terminate predictably without leaving invalid stream state behind

### 6. Client Disconnect and Cancellation Handling
- [x] Validate behavior when the downstream client disconnects or cancels stream consumption before completion
- [x] Ensure upstream iteration and any in-flight provider streaming work are halted, aborted, or safely ignored according to current runtime capabilities to avoid resource leaks
- [x] Verify disconnect handling stays within the existing adapter/service model and does not require architectural redesign

### 7. Backpressure and Buffering Hardening
- [x] Explicitly evaluate the current serverless adapter implementation in `src/serverless/adapter.ts` that uses `ReadableStream.start(...)` with eager iteration of the async chunk source
- [x] Validate whether the current adapter preserves true incremental streaming behavior, respects downstream backpressure signals in practice, and halts upstream iteration on client disconnect or cancellation
- [x] Identify any unintended buffering or over-eager consumption patterns in the runtime, adapter, or provider integration layers
- [x] Define required hardening steps within the existing adapter model to reduce over-buffering, improve cancellation handling, and better align chunk production with downstream demand where the runtime supports it

### 8. Streaming Observability
- [x] Define safe observability expectations for stream start, chunk activity, completion, error, and disconnect events
- [x] Ensure observability remains content-safe and does not log prompts, outputs, credentials, bearer tokens, or raw upstream payloads
- [x] Confirm streaming telemetry fits the existing observability boundaries rather than introducing provider-specific logging semantics into gateway layers

### 9. Test Strategy
- [x] Add integration-style tests for normal streaming, slow/long-running streams, large-output streams, upstream mid-stream failure, and client disconnect scenarios
- [x] Add adapter-focused tests that validate SSE framing, streaming incrementality, cancellation propagation, and any hardening applied to the current `ReadableStream` implementation
- [x] Use real or realistically mocked OpenAI-style streaming responses to validate provider adaptation behavior without weakening gateway-level streaming guarantees
- [x] Preserve existing public API contract coverage to ensure hardening does not change `/ai` request or response shape

## Non-Goals
- Redesigning the gateway streaming architecture or introducing new cross-layer streaming abstractions
- Adding provider-specific behavior to gateway layers or changing the existing execution and policy flow
- Expanding this phase into multi-provider streaming implementation beyond what is needed to keep the contract provider-agnostic

## Acceptance Criteria
- [x] The gateway streaming contract is validated end-to-end and clarified only as needed at the gateway level, not as provider-specific behavior
- [x] Streaming through the current serverless adapter is verified to be correctly formatted, incrementally delivered where supported, and hardened against unintended buffering risks
- [x] Mid-stream failure and client disconnect behavior are defined, tested, and made production-safe within the existing architecture
- [x] Streaming observability captures operational lifecycle signals without exposing sensitive content
- [x] The `/ai` public contract, policy flow, and provider abstraction remain unchanged while streaming reliability improves
