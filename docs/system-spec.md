# System Spec

## Purpose

`@evergraytech/ai-gateway` is a centralized backend service that authorizes and executes hosted AI requests on behalf of EverGray Tech applications. It protects provider credentials, enforces server-side policy, and exposes a consistent interface for downstream consumers.

## Core responsibilities

- issue signed tokens for hosted execution requests
- validate request identity context through `appId` and `clientId`
- enforce rate limits and request-level safety constraints
- restrict hosted execution to approved providers and models
- proxy approved requests to upstream model providers
- return standard and streaming responses to clients
- emit operational signals useful for monitoring service behavior

## Deployment model

- stateless serverless HTTP service
- horizontally scalable request handling
- externalized infrastructure for durable coordination concerns such as production-grade rate limiting and telemetry sinks

## Trust and security boundaries

- provider API keys remain server-side only
- clients must not be treated as trusted enforcement actors
- signed tokens authorize hosted execution and encode server-enforced constraints
- `appId` identifies the consuming application context but is not a secret credential by itself
- `clientId` provides anonymous-but-stable client identity context for abuse prevention and observability

## Hosted execution contract

The hosted path follows this shape:

1. client calls `/auth`
2. gateway returns a short-lived signed token
3. client calls `/ai` with the token and normalized request payload
4. gateway validates, enforces, executes, and responds

## Enforcement model

- all limits are hard enforced server-side
- invalid, expired, or malformed authorization tokens are rejected
- requests exceeding configured token or policy limits are rejected
- unsupported provider/model combinations are rejected before upstream execution
- both `/auth` and `/ai` are protected by rate limiting

## Observability boundaries

- collect request counts, error counts, approximate token usage when available, and rate-limit violations
- keep observability focused on system operation rather than end-user dashboards
- exclude raw secrets, provider credentials, and sensitive payload content from logs and metrics
