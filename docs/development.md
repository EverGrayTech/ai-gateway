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

## Quality expectations

Before considering a change ready, verify:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
