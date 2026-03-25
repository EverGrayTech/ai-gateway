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

## Service design expectations

- Keep the gateway stateless and suitable for serverless HTTP deployment
- Keep domain logic portable and separate from runtime adapter code
- Preserve strict boundaries between auth, policy enforcement, provider execution, and infrastructure adapters
- Avoid introducing documentation or package metadata that implies frontend-only, Python/FastAPI, or non-gateway responsibilities
