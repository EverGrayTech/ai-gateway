# EverGray Tech: AI Gateway

`@evergraytech/ai-gateway` is a centralized backend service package for hosted AI execution. It receives normalized requests from client applications, issues signed authorization tokens, enforces gateway policy, proxies approved requests to upstream model providers, and returns standard or streaming responses without exposing provider credentials to clients.

## What it does

- secures provider API keys behind a shared gateway
- issues short-lived signed tokens for hosted requests
- enforces request limits, model/provider restrictions, and abuse controls
- supports multiple consuming applications through `appId`
- tracks operational signals such as request volume, failures, and rate-limit activity
- provides a consistent hosted execution interface that downstream apps can integrate against

## Hosted gateway role

The gateway is the execution and enforcement layer behind EverGray Tech AI-enabled clients. Client applications identify themselves with `appId`, send a persistent `clientId`, obtain a signed token from `/auth`, and use that token with `/ai` for hosted execution.

Bring-your-own-key flows remain outside the gateway path. In those cases, clients call providers directly and this package is not involved in inference execution.

## Installation

```bash
pnpm add @evergraytech/ai-gateway
```

## Documentation map

- [Consumption Guide](docs/consumption-guide.md) — downstream integration expectations and gateway contract
- [Development Guide](docs/development.md) — maintainer workflow, quality checks, and repository standards
- [System Spec](docs/system-spec.md) — architectural boundaries and service responsibilities

## MVP hosted contract summary

The public hosted flow is:

1. `POST /auth` with `appId` and persistent `clientId`
2. receive a short-lived signed bearer token
3. `POST /ai` with `Authorization: Bearer <token>` and a normalized hosted request body
4. receive either JSON output or an SSE stream, depending on `stream`

The gateway currently supports hosted provider execution for `openai`, `anthropic`, `gemini`, and `openrouter`. The repository default remains `openai` with default model `gpt-4o-mini`, while other providers require explicit configuration and approved model selection. Unsupported providers/models, malformed payloads, missing or invalid tokens, and rate-limited requests are hard rejected by the gateway.

## Operator notes

- production deployments must provide a strong `AI_GATEWAY_SIGNING_SECRET`
- the gateway is designed for stateless serverless HTTP deployment
- production-grade rate limiting, telemetry sinks, and provider credential management should be supplied through external adapters/infrastructure
- streaming depends on runtime support for incremental HTTP response delivery

## Provider configuration notes

The current environment contract supports server-side credentials for these hosted providers:

- `OPENAI_API_KEY` and optional `OPENAI_BASE_URL`
- `ANTHROPIC_API_KEY` and optional `ANTHROPIC_BASE_URL`
- `GEMINI_API_KEY` and optional `GEMINI_BASE_URL`
- `OPENROUTER_API_KEY` and optional `OPENROUTER_BASE_URL`

OpenRouter is treated as an explicitly governed hosted provider rather than an unrestricted passthrough. Approved provider/model combinations remain enforced by gateway policy.

## Package focus

This package centers on:

- server-side request authorization and enforcement
- hosted AI request execution through approved providers
- serverless-friendly service design
- consistent handling of streaming and non-streaming responses

It is intended for service maintainers and platform integrations that need a single backend gateway for AI execution across multiple applications.
