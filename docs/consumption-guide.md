# Consumption Guide

This document is the canonical entrypoint for downstream developers integrating `@evergraytech/ai-gateway`.

## Purpose

`@evergraytech/ai-gateway` is the hosted execution layer for EverGray Tech AI-enabled applications. It authorizes requests, enforces gateway policy, forwards approved work to model providers, and returns standard or streaming responses through a single backend interface.

## Integration model

Client applications interact with the gateway in two steps:

1. Call `/auth` with:
   - `appId`
   - `clientId`
2. Receive a signed token and send it with `/ai` requests

All hosted requests must include application context and client identity context.

### Hosted request sequence

#### `POST /auth`

Request body:

```json
{
  "appId": "my-app",
  "clientId": "stable-anonymous-client-id"
}
```

Response body:

```json
{
  "token": "<signed-token>",
  "issuedAt": "2026-03-25T00:00:00.000Z",
  "expiresAt": "2026-03-25T00:15:00.000Z"
}
```

#### `POST /ai`

Headers:

- `Authorization: Bearer <signed-token>`

Request body:

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "input": "hello world",
  "stream": false
}
```

`provider` may be omitted when client code already assumes the hosted default path, and `model` may be omitted to use the v1 hosted default model.

Non-streaming success response:

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "output": "...",
  "usage": {
    "inputTokens": 3,
    "outputTokens": 12,
    "totalTokens": 15
  }
}
```

Streaming success responses are returned as `text/event-stream` and should be consumed incrementally.

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

Hosted bearer tokens are required for `/ai`. Missing, malformed, invalid, or expired tokens are rejected before provider execution begins.

## AI execution flow

`/ai` accepts a signed token plus a normalized request payload.

The gateway:

- validates the token
- enforces request constraints
- validates provider/model selection against gateway policy
- executes the approved request against an upstream provider
- returns a standard or streaming response

In v1, the hosted default model is `gpt-4o-mini`. If a client omits `model`, the gateway applies this default. If a client requests a provider or model outside the gateway allowlist, the request is rejected rather than coerced.

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

### Retry guidance

- retry only when the failure class is plausibly transient, such as a safe upstream failure or an interrupted stream
- do not blind-retry validation, authentication, policy, or unsupported-model errors
- when rate limited, respect the server response and back off before retrying
- when tokens expire, obtain a fresh token through `/auth` before retrying `/ai`

## Streaming behavior

The gateway can return streaming responses for supported hosted executions. Client integrations should:

- consume streamed output incrementally
- handle interrupted streams safely
- preserve the same auth and request-validation flow used for non-streaming requests

Some serverless platforms buffer or restrict streaming behavior. The gateway contract supports streaming, but operators should validate incremental delivery in the target runtime before treating it as production-ready behavior.

## Security expectations

- Never embed hosted provider credentials in client applications
- Treat all gateway responses as network data subject to validation in the client integration layer
- Avoid storing sensitive request payloads or tokens in insecure logs or analytics sinks

## Hosted path versus BYOK

Hosted path responsibilities:

- gateway issues and validates signed execution tokens
- gateway enforces policy, rate limiting, and hosted provider/model restrictions
- gateway keeps provider credentials server-side

BYOK responsibilities:

- client applications integrate with providers directly
- client-owned provider keys never pass through this gateway
- hosted `/auth` and `/ai` contracts do not apply to the direct-provider bypass path
