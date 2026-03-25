# Plan: Provider Execution and Streaming

## Objective
Define the hosted AI execution layer, including the provider abstraction, one initial concrete provider implementation, normalized request/response contracts, and streaming passthrough behavior for serverless deployment.

## Customer Value
- Delivers the core hosted AI capability clients need through a single gateway interface
- Preserves future provider flexibility without forcing every client to manage provider-specific integration details
- Supports streaming interactions that improve perceived latency and chat-style user experiences

## Scope Decisions (Locked)
- The MVP must introduce a provider abstraction, but only one concrete provider needs to be implemented initially
- Provider API keys remain server-side only and must never be exposed through client-facing responses or logs
- The gateway operates as a constrained pass-through layer rather than a complex routing engine in v1
- Streaming is required and should be passed through to clients using runtime-safe serverless response patterns where supported

## Prerequisites
- `docs/system-spec.md`
- `.plans/01-serverless-service-foundation.md`
- `.plans/03-policy-and-enforcement-core.md`
- `.plans/04-rate-limiting-and-observability.md`

## Implementation Checklist

### 1. Provider Abstraction Contracts
- [ ] Define provider interfaces for request execution, streaming execution, response normalization, and error mapping
- [ ] Define the provider/model metadata needed by the gateway without overcommitting to provider-specific feature parity
- [ ] Ensure the abstraction can support future additional providers without reshaping the public gateway contract

### 2. Initial Concrete Provider Integration
- [ ] Implement one initial provider adapter suitable for the hosted MVP path
- [ ] Define environment configuration and credential handling for the initial provider
- [ ] Ensure upstream request construction respects normalized gateway policy outputs rather than raw client payloads

### 3. Response Normalization
- [ ] Define a normalized non-streaming response contract for successful completions and provider-originated failures
- [ ] Map upstream provider responses into gateway-safe output structures without leaking provider secrets or irrelevant internals
- [ ] Capture approximate usage metadata when the provider makes it available

### 4. Streaming Passthrough Behavior
- [ ] Define the normalized streaming contract exposed by the gateway to clients
- [ ] Ensure streaming responses pass through incrementally rather than buffering the full completion first
- [ ] Define graceful fallback or documented limitations for serverless runtimes where streaming capabilities vary

### 5. Execution-Focused Test Coverage
- [ ] Cover successful hosted execution for both standard and streaming requests
- [ ] Cover provider-originated failure handling and safe error translation
- [ ] Verify provider adapters cannot be invoked until upstream policy/auth/rate-limit checks have already passed

## Acceptance Criteria
- [ ] The gateway exposes a provider abstraction with one working hosted provider implementation for MVP use
- [ ] Hosted requests can execute through the gateway without exposing provider credentials to clients
- [ ] Standard and streaming responses are both supported through normalized gateway behavior
- [ ] Provider failures are translated into safe, consistent gateway responses
- [ ] The design remains extensible for future providers without rewriting the enforcement or API layers
