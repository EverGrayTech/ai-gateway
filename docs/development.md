# Development Guide

This document is the canonical maintainer workflow reference for `@evergraytech/ai-gateway`.

## Purpose

Use this guide when developing, validating, and maintaining the package inside this repository.

## Prerequisites

- Node.js compatible with the repo toolchain
- `pnpm` available on your machine

## Install

Install repo dependencies from the repository root:

```bash
pnpm install
```

## Core commands

Run these from the repository root:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm lint
```

Use PowerShell-safe separate commands rather than chaining with `&&` in this repo's Windows environment.

## Documentation expectations

When package behavior changes, update the relevant docs:

- [README.md](README.md) for repo-level orientation
- [Consumption Guide](docs/consumption-guide.md) for downstream consumers
- [System Spec](docs/system-spec.md) for architectural expectations when needed
- `.plans/` when implementation phases are added or completed

Keep `docs/` language declarative and architecture-focused. Avoid temporal framing such as roadmap phrasing, implementation-phase commentary, or status labels in repository documentation.

## Quality expectations

Before considering a change ready, verify:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

The current repository test command enforces a global branch coverage threshold. Functional tests may all pass while `pnpm test` still exits non-zero if coverage remains below the configured threshold.

## Operator configuration expectations

Production operators should document and supply:

- `AI_GATEWAY_SIGNING_SECRET` as a strong secret from managed secret storage
- hosted provider credentials through server-side-only infrastructure wiring, including any supported provider-specific API keys and optional base URLs
- durable rate-limiting infrastructure for production coordination, including `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` when using Upstash Redis as the external backend
- telemetry sinks appropriate for the deployment environment

Development and local validation may use the repository's in-memory fallback adapters, but those are explicitly non-production implementations.

## Serverless runtime expectations

- keep the service stateless across requests
- do not rely on in-process memory for production coordination guarantees
- validate streaming support in the target platform because some runtimes buffer responses
- keep adapter-specific behavior at the edge and preserve portable core service logic

## Local integration workflow

For local hosted-path verification, validate:

1. `/auth` token issuance with `appId` and `clientId`
2. `/ai` non-streaming execution with the bearer token
3. `/ai` streaming execution with `stream: true`
4. rejection scenarios such as invalid JSON, missing bearer token, unsupported model, and rate limiting

Use mocked or stubbed provider executors for deterministic tests when validating contract behavior without external infrastructure.

## Service design expectations

- Keep the gateway stateless and suitable for serverless HTTP deployment
- Keep domain logic portable and separate from runtime adapter code
- Preserve strict boundaries between auth, policy enforcement, provider execution, and infrastructure adapters
- Avoid introducing documentation or package metadata that implies frontend-only, Python/FastAPI, or non-gateway responsibilities
