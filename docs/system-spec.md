# System Spec

## Purpose

`@evergraytech/ai-gateway` is a centralized backend service that authorizes and executes AI requests on behalf of EverGray Tech applications. It protects hosted provider credentials, enforces server-side policy, supports request-scoped BYOK credentials, and exposes a consistent interface for downstream consumers.

## Core responsibilities

- issue signed tokens for hosted default execution requests
- validate request identity context through `appId` and `clientId`
- enforce rate limits and request-level safety constraints
- restrict hosted execution to approved providers and models
- proxy approved requests to upstream model providers
- return standard and streaming responses to clients
- emit operational signals useful for monitoring service behavior

The current hosted provider surface includes OpenAI, Anthropic, Gemini, and OpenRouter behind one normalized gateway contract.

## Deployment model

- stateless serverless HTTP service
- horizontally scalable request handling
- externalized infrastructure for durable coordination concerns such as production-grade rate limiting and telemetry sinks

## Trust and security boundaries

- hosted provider API keys remain server-side only
- request-scoped BYOK provider credentials may be forwarded per request but must never be persisted or emitted to logs, telemetry, or error surfaces
- clients must not be treated as trusted enforcement actors
- signed tokens authorize hosted execution and encode server-enforced constraints
- `appId` identifies the consuming application context but is not a secret credential by itself
- `clientId` provides anonymous-but-stable client identity context for abuse prevention and observability

## AI execution contract

The gateway supports two `/ai` request shapes:

1. **Hosted/default**
   1. client calls `/auth`
   2. gateway returns a short-lived signed token
   3. client calls `/ai` with the hosted token and a body omitting `provider` and `model`
   4. gateway validates, enforces, executes, and responds using configured hosted defaults
2. **Explicit BYOK**
   1. client calls `/ai` with `provider`, `model`, and `X-EG-AI-Provider-Credential`
   2. gateway validates the explicit request shape, validates that the provider is supported, and applies only minimal model-format checks required for safe forwarding
   3. gateway executes the request with the supplied raw provider credential and passes the supplied model through to the upstream provider without persisting the credential
   4. gateway responds through the same standard or streaming response contract

## Enforcement model

- all limits are hard enforced server-side
- invalid, expired, or malformed hosted authorization tokens are rejected for hosted/default requests
- invalid mixed or partial hosted/BYOK request shapes are rejected before upstream execution
- requests exceeding configured limits are rejected
- unsupported providers are rejected before upstream execution, while explicit BYOK model identifiers may be forwarded after basic validation and rejected upstream if invalid
- both `/auth` and `/ai` are protected by rate limiting

## Observability boundaries

- collect request counts, error counts, approximate token usage when available, and rate-limit violations
- keep observability focused on system operation rather than end-user dashboards
- exclude raw secrets, provider credentials, and sensitive payload content from logs and metrics
