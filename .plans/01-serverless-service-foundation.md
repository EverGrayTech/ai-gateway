# Plan: Serverless Service Foundation

## Objective
Define the TypeScript-first foundation for `@evergraytech/ai-gateway` as a stateless serverless HTTP service, including runtime-safe module boundaries, request handling seams, configuration loading, and normalized error behavior.

## Customer Value
- Establishes a stable backend foundation that downstream EverGray apps can rely on across hosted AI usage
- Reduces rework by locking runtime-safe architecture decisions before auth, policy, and provider execution are implemented
- Keeps the service portable across serverless platforms instead of coupling the MVP to one hosting vendor too early

## Scope Decisions (Locked)
- The MVP deployment target is a serverless HTTP runtime, so no plan may depend on sticky sessions or long-lived in-memory state
- Core gateway behavior should remain framework-agnostic, with a thin serverless adapter around portable TypeScript service modules
- Streaming support must be treated as a first-class requirement, but platform-specific delivery details should stay behind adapter seams
- Development ergonomics may include local fallbacks, but production design must assume external services for durable coordination where needed
- This plan defines service structure and runtime boundaries, not provider-specific execution logic

## Prerequisites
- `docs/system-spec.md`

## Implementation Checklist

### 1. Runtime and Module Boundaries
- [x] Define the core service layers for HTTP adaptation, request orchestration, policy enforcement, provider execution, and infrastructure adapters
- [x] Separate pure domain logic from runtime-specific concerns so serverless adapters remain thin and replaceable
- [x] Define the serverless handler contract for standard request, response, and streaming-capable pathways

### 2. Configuration and Environment Contracts
- [x] Define environment configuration contracts for signing secrets, provider credentials, defaults, and adapter dependencies
- [x] Establish startup-time validation behavior that fails fast on invalid or incomplete required configuration
- [x] Distinguish local-development fallbacks from production-required environment inputs

### 3. Error and Response Normalization
- [x] Define normalized success and error response shapes for `/auth` and `/ai`
- [x] Establish error categories for validation failures, authentication failures, policy rejection, rate limiting, upstream provider failures, and internal faults
- [x] Ensure error behavior avoids leaking secrets, provider credentials, or other sensitive operational details

### 4. Request Context and Cross-Cutting Utilities
- [x] Define shared request-context contracts covering `appId`, `clientId`, IP-derived context, tracing hooks, and runtime metadata
- [x] Introduce shared utilities for structured logging, correlation identifiers, and request timing
- [x] Define safe extension points for rate limiting, observability, and provider adapters to plug into the request lifecycle

### 5. Test and Local Execution Foundation
- [x] Define the baseline testing approach for pure modules, HTTP integration, and streaming-capable behavior in a serverless-friendly setup
- [x] Establish local development entry points that exercise the same core request pipeline used by deployed handlers
- [x] Ensure the foundation supports deterministic testing without requiring live provider credentials or managed infrastructure

## Acceptance Criteria
- [x] Core gateway logic is organized into portable TypeScript modules with a thin serverless HTTP adapter
- [x] Required environment configuration is clearly defined and validated before request handling proceeds
- [x] Error handling is normalized, safe, and suitable for both `/auth` and `/ai`
- [x] Shared request context supports future auth, enforcement, rate limiting, and observability work without architectural rework
- [x] The foundation supports local development and automated testing without assuming serverful runtime features
