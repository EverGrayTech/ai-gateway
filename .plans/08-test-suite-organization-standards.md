# Plan: Test Suite Organization Standards

## Objective
Define and adopt a maintainable repository-wide test organization standard for `@evergraytech/ai-gateway` that makes test ownership, coverage boundaries, and integration scope clear as the codebase grows.

## Customer Value
- Makes it easier for maintainers to find the tests associated with any source module quickly
- Reduces the risk of large, catch-all test files becoming difficult to evolve safely
- Clarifies the difference between module-level verification and cross-module gateway workflow validation

## Scope Decisions (Locked)
- The deployment target remains a stateless serverless HTTP service, so test organization must preserve clear boundaries between portable core logic, provider adapters, and serverless edge integration
- The default repository convention should mirror `src/` inside `test/` for module-level and subsystem-level tests
- Cross-module and public-surface validation should remain in explicitly named integration-style areas rather than being forced into mirrored unit-test folders
- This plan defines structure and naming conventions; it does not change product behavior or reduce existing coverage expectations

## Prerequisites
- `docs/system-spec.md`
- `docs/development.md`
- `.rules/20-backend.md`
- `.rules/30-testing.md`
- `.plans/06-end-to-end-gateway-api.md`

## Implementation Checklist

### 1. Repository Test Taxonomy
- [x] Define `test/` as the repository root for TypeScript test files
- [x] Mirror `src/` inside `test/` for module-scoped and subsystem-scoped tests
- [x] Reserve dedicated top-level test areas such as `test/integration/` or `test/workflows/` for public API and cross-module pipeline validation

### 2. File and Naming Conventions
- [x] Align test filenames with the source file or source area they validate whenever the test scope is module-local
- [x] Prefer narrow, responsibility-based names over broad umbrella names such as `foundation`, `misc`, or `helpers` when those names obscure test intent
- [x] Keep each test file focused on one module, one adapter, or one clearly defined behavior slice

### 3. Scope Boundaries
- [x] Treat tests under mirrored paths as unit or subsystem tests for portable gateway components such as config, policy, runtime, providers, auth, and observability
- [x] Treat tests covering `/auth`, `/ai`, streaming behavior, and shared request-pipeline behavior as integration tests when they validate multiple layers together
- [x] Avoid duplicating the same scenario across mirrored module tests and integration tests unless the scopes are intentionally different

### 4. Migration Guidance for Existing Tests
- [x] Break up oversized or mixed-purpose test files into smaller files organized by module responsibility or workflow responsibility
- [x] Move assertions for config, policy, auth, provider execution, runtime context, observability, and serverless behavior closer to their corresponding source areas where practical
- [x] Keep temporary behavior-grouped directories only when they clearly represent cross-cutting integration coverage rather than deferred cleanup

### 5. Ongoing Maintenance Rules
- [x] Require new tests to follow the mirrored-path convention unless they are explicitly integration or workflow tests
- [x] Prefer adding a new focused file over expanding an unrelated existing test file beyond its original concern
- [x] Review test placement during refactors so test structure continues to reflect production architecture and ownership boundaries

## Acceptance Criteria
- [x] Maintainers can infer where a test belongs by looking at the corresponding `src/` path
- [x] Cross-module gateway-flow tests are separated from module-level tests by directory and naming conventions
- [x] The repository avoids reintroducing large catch-all test files as new features are added
- [x] Test organization remains aligned with the stateless serverless deployment model and the gateway’s architectural boundaries
