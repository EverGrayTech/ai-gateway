# Consumption Guide

This document is the canonical entrypoint for downstream developers integrating `@evergraytech/ai-gateway`.

## Purpose

`@evergraytech/ai-gateway` is the hosted execution layer for EverGray AI-enabled applications. It authorizes requests, enforces gateway policy, forwards approved work to model providers, and returns standard or streaming responses through a single backend interface.

## Integration model

Client applications interact with the gateway in two steps:

1. Call `/auth` with:
   - `appId`
   - `clientId`
2. Receive a signed token and send it with `/ai` requests

All hosted requests must include application context and client identity context.

## Required client responsibilities

### `appId`

- Every hosted request must include an `appId`
- `appId` identifies the consuming application for gateway enforcement and observability
- `appId` is not a standalone secret or user-authentication mechanism

### `clientId`

- Each client should generate and persist a stable `clientId`
- `clientId` improves abuse prevention and rate-limiting granularity
- `clientId` should be sent consistently across `/auth` and `/ai` interactions

## Auth flow

`/auth` issues a short-lived signed token used for hosted execution.

Clients should:

- request a token shortly before use
- treat the token as opaque authorization data
- refresh the token when it expires
- avoid logging or exposing tokens unnecessarily

## AI execution flow

`/ai` accepts a signed token plus a normalized request payload.

The gateway:

- validates the token
- enforces request constraints
- validates provider/model selection against gateway policy
- executes the approved request against an upstream provider
- returns a standard or streaming response

## Hosted path and direct-provider path

When the hosted gateway path is used:

- clients do not send provider API keys to the browser
- clients do not call upstream providers directly
- gateway policy determines what hosted models and providers may be used

When a direct-provider bring-your-own-key path is used:

- clients integrate with the provider directly
- gateway-issued hosted tokens are not part of that flow
- gateway enforcement does not execute the request

## Failure behavior

Clients should expect hard rejections when requests are invalid or disallowed. Typical rejection categories include:

- missing or invalid token
- expired token
- malformed request payload
- unsupported provider or model selection
- exceeded request limits
- rate-limit rejection

Client integrations should handle these responses explicitly and avoid assuming all failures are retryable.

## Streaming behavior

The gateway can return streaming responses for supported hosted executions. Client integrations should:

- consume streamed output incrementally
- handle interrupted streams safely
- preserve the same auth and request-validation flow used for non-streaming requests

## Security expectations

- Never embed hosted provider credentials in client applications
- Treat all gateway responses as network data subject to validation in the client integration layer
- Avoid storing sensitive request payloads or tokens in insecure logs or analytics sinks
