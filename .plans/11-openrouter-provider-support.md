# Plan: OpenRouter Provider Support

## Objective
Add OpenRouter as a supported hosted provider behind the gateway abstraction while maintaining explicit gateway control over provider and model allowlisting, normalized request and response behavior, and server-side credential isolation.

## Customer Value
- Broadens hosted model reach for downstream applications through a single gateway-managed provider integration
- Enables access to approved OpenRouter-routed models without requiring clients to manage aggregator-specific semantics directly
- Preserves the gateway’s role as the enforcement boundary even when the upstream provider itself fronts multiple model vendors

## Scope Decisions (Locked)
- OpenRouter support must fit the existing stateless serverless HTTP deployment model and must not depend on durable in-process state
- OpenRouter must be treated as a server-side hosted provider integration, not as a generic arbitrary passthrough surface for any upstream model identifier
- The gateway must continue enforcing explicit provider and model allowlists for OpenRouter-routed models rather than delegating unrestricted selection to clients
- OpenRouter credentials and routing configuration must remain server-side only and must never appear in logs, responses, or client-side code paths
- The gateway public contract must remain normalized, with any OpenRouter-specific request, attribution, or streaming details translated behind provider boundaries

## Prerequisites
- `docs/system-spec.md`
- `.plans/01-serverless-service-foundation.md`
- `.plans/03-policy-and-enforcement-core.md`
- `.plans/05-provider-execution-and-streaming.md`
- `.plans/06-end-to-end-gateway-api.md`

## Implementation Checklist

### 1. Provider Configuration and Credentials
- [x] Extend environment and configuration contracts to support OpenRouter credentials and any required server-side base configuration
- [x] Preserve safe startup validation so OpenRouter configuration errors fail fast and do not degrade request-time behavior
- [x] Keep OpenRouter configuration isolated behind the existing configuration seam to avoid coupling core gateway logic to aggregator-specific details

### 2. OpenRouter Model Governance and Registration
- [x] Define explicit OpenRouter model metadata and allowlisted hosted model identifiers approved for gateway use
- [x] Register OpenRouter within provider execution without changing the normalized gateway contract or weakening provider-selection enforcement
- [x] Ensure defaults and routing behavior remain explicit so OpenRouter availability does not implicitly broaden hosted model access

### 3. Request Execution and Response Normalization
- [x] Implement an OpenRouter provider executor that maps normalized gateway input into controlled upstream requests
- [x] Normalize OpenRouter responses into the existing gateway success shape, including usage metadata when available through the upstream response
- [x] Translate OpenRouter and routed-upstream failures into safe gateway errors without exposing unnecessary aggregator or downstream provider internals

### 4. Streaming Behavior
- [x] Adapt OpenRouter streaming behavior into the gateway’s normalized streaming contract expected by clients
- [x] Verify streamed responses remain incremental and compatible with the current serverless response model
- [x] Ensure provider-specific streaming metadata or routed-upstream event details are filtered or normalized before reaching clients

### 5. Test Coverage and Contract Validation
- [x] Add provider tests for OpenRouter success, allowlist enforcement, provider/model mismatch handling, and safe failure translation
- [x] Extend config and integration tests where needed to validate OpenRouter credential loading and hosted execution wiring
- [x] Verify that OpenRouter support preserves existing OpenAI behavior and continues meeting repository coverage expectations

## Acceptance Criteria
- [x] OpenRouter can be configured as a hosted provider using server-side-only credentials and explicit model governance
- [x] Only approved OpenRouter-routed models can be invoked through the normalized `/ai` contract
- [x] OpenRouter standard and streaming responses are translated into safe gateway behavior without leaking aggregator-specific internals
- [x] OpenRouter failures are mapped into consistent gateway-safe errors
- [x] The gateway remains the enforcement boundary for provider and model access even when using an aggregator-backed provider
