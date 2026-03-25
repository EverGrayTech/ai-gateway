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

The gateway is the execution and enforcement layer behind EverGray AI-enabled clients. Client applications identify themselves with `appId`, send a persistent `clientId`, obtain a signed token from `/auth`, and use that token with `/ai` for hosted execution.

Bring-your-own-key flows remain outside the gateway path. In those cases, clients call providers directly and this package is not involved in inference execution.

## Installation

```bash
pnpm add @evergraytech/ai-gateway
```

## Documentation map

- [Consumption Guide](docs/consumption-guide.md) — downstream integration expectations and gateway contract
- [Development Guide](docs/development.md) — maintainer workflow, quality checks, and repository standards
- [System Spec](docs/system-spec.md) — architectural boundaries and service responsibilities

## Package focus

This package centers on:

- server-side request authorization and enforcement
- hosted AI request execution through approved providers
- serverless-friendly service design
- consistent handling of streaming and non-streaming responses

It is intended for service maintainers and platform integrations that need a single backend gateway for AI execution across multiple applications.
