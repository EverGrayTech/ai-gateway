# Plan 28: Permissive Explicit-BYOK Model Pass-Through Policy

## Objective

Adjust gateway policy behavior so hosted/default execution can remain tightly allowlisted while explicit BYOK execution becomes provider-validated and model-pass-through oriented. The gateway should stop requiring repository catalog updates for every new upstream model identifier in the explicit BYOK path, especially for fast-moving provider ecosystems such as OpenRouter, OpenAI, and Gemini.

## Deployment and Hosting Constraint Check

- The gateway is a stateless serverless HTTP service behind a serverless adapter.
- Policy evaluation must remain portable core logic, not runtime-specific adapter behavior.
- Hosted provider credentials must remain server-side only.
- Request-scoped BYOK credentials must remain transient, never persisted, and never exposed in logs, telemetry, or error surfaces.
- Because the deployment target is stateless, any explicit-BYOK permissiveness must be expressed as request-time validation only; it cannot rely on cached model catalogs or durable synchronization with upstream providers.

## Current Behavior Summary

### Where the observed rejection happens
- The hosted-route rejection string `Requested model "..." is not allowed for this hosted route.` is emitted in `src/policy/core.ts` inside `evaluateExecutionIntent(...)`.
- Explicit BYOK requests are evaluated separately in `src/policy/core.ts` by `evaluateByokExecutionIntent(...)`.
- The runtime branch that selects between hosted/default and explicit BYOK currently lives in `src/runtime/service.ts` and is already structurally separated by request shape.

### Why explicit BYOK is still too restrictive today
- `evaluateByokExecutionIntent(...)` does not use the hosted `allowedModelsByProvider` allowlist.
- However, it still requires the requested model to appear in the canonical static provider catalog via `getSupportedModelsForProvider(...)` from `src/providers/catalog.ts`.
- That means hosted and explicit BYOK do not share the exact same allowlist check, but they **do** share the same static model-catalog dependency.
- In practice, this still forces repository updates whenever a provider exposes a new model identifier, which breaks the desired explicit-BYOK pass-through architecture.

## Scope Decisions (Locked)

- Keep hosted/default policy strict and allowlist-driven.
- Keep explicit BYOK request-shape validation strict.
- Keep provider-name validation for explicit BYOK strict.
- Make explicit BYOK model handling permissive after lightweight provider-specific format validation.
- Do not require explicit BYOK model identifiers to appear in the repository-maintained provider catalog.
- Continue enforcing gateway-owned safety bounds such as input size and max output token limits.
- Let upstream providers remain the source of truth for exact model existence in explicit BYOK flows.
- Do not introduce background model synchronization, dynamic provider discovery, or persistent model registry state.

## Required Behavioral Split

### Hosted/default path
- Continue using configured hosted policy allowlists.
- Continue enforcing approved hosted provider/model combinations.
- Continue supporting app-specific hosted overrides and token-based hosted constraints.
- Continue rejecting hosted requests that attempt to use non-allowlisted or non-supported models.

### Explicit BYOK path
- Continue requiring valid explicit BYOK request shape:
  - `provider` present
  - `model` present
  - `X-EG-AI-Provider-Credential` present
- Continue rejecting unsupported provider names.
- Stop requiring the requested model to be present in the static catalog.
- Add only lightweight provider-specific model-format validation where necessary.
- Pass the supplied model string upstream unchanged once shape/provider/format checks pass.

## Recommended Policy Design

### 1. Separate hosted catalog enforcement from BYOK provider support
- Treat the current static catalog in `src/providers/catalog.ts` as a hosted-policy and documentation aid, not the authoritative explicit-BYOK model gate.
- Introduce a provider-support concept for explicit BYOK that answers only: “is this provider implemented by the gateway?”
- Keep hosted/default logic free to continue using explicit model allowlists.

### 2. Replace explicit-BYOK exact model membership checks with lightweight format validation
- Refactor `evaluateByokExecutionIntent(...)` so it no longer performs:
  - exact membership check against `getSupportedModelsForProvider(provider)`
- Replace that with:
  - supported-provider validation
  - normalized non-empty model validation
  - provider-specific shape checks only where justified
  - existing gateway-owned token/input/output bounds

### 3. Keep upstream as source of truth for exact BYOK model existence
- If a caller supplies a syntactically acceptable but nonexistent upstream model, the provider executor should forward it and the upstream provider should reject it.
- The gateway should surface that as an upstream/provider failure, not as a policy-model-not-allowed error.

## Provider-Specific Guidance

### OpenRouter
- OpenRouter benefits the most from pass-through behavior because its namespace changes frequently and commonly uses `vendor/model` identifiers.
- For explicit BYOK, validation should be format-oriented rather than catalog-oriented.
- A lightweight rule such as “non-empty normalized string, with OpenRouter-compatible namespaced shape when needed” is preferable to maintaining a full model inventory in-repo.
- The gateway should avoid treating the hosted OpenRouter allowlist as the explicit-BYOK OpenRouter model universe.

### OpenAI / Gemini / Anthropic
- These providers also evolve quickly enough that exact catalog enforcement in explicit BYOK creates avoidable maintenance churn.
- Lightweight provider-specific format guards are acceptable if they prevent obviously malformed requests, but exact model existence should remain upstream-owned.

## Implementation Phases

### 1. Policy Contract Refactor
- [x] Introduce a clear separation between:
  - hosted allowlisted models
  - gateway-supported provider names for explicit BYOK
- [x] Refactor explicit-BYOK evaluation in `src/policy/core.ts` so it no longer depends on exact static model membership
- [x] Preserve hosted/default evaluation semantics unchanged unless strictly required for the refactor

### 2. Lightweight BYOK Model Validation
- [x] Define minimal provider-specific format validation rules for explicit BYOK model strings
- [x] Apply those rules only in the explicit BYOK path
- [x] Ensure validation remains conservative enough to catch obviously malformed values without recreating a static model catalog gate

### 3. Runtime and Error Semantics
- [x] Preserve existing request-shape routing in `src/runtime/service.ts`
- [x] Ensure explicit BYOK failures caused by malformed model strings remain validation errors
- [x] Ensure explicit BYOK failures caused by unknown upstream models surface as upstream/provider errors rather than hosted policy errors

### 4. Test Coverage
- [x] Add policy tests proving hosted/default remains strict and allowlist-driven
- [x] Add explicit-BYOK policy tests proving supported providers accept non-catalog model identifiers when format-valid
- [x] Add tests for provider-specific malformed model identifiers in explicit BYOK
- [x] Add integration coverage for OpenRouter explicit BYOK using a non-catalog but format-valid model identifier
- [x] Preserve or update tests that currently assume catalog membership is required in the BYOK path

### 5. Documentation Updates
- [x] Update `docs/consumption-guide.md` to state that hosted/default is allowlisted while explicit BYOK is provider-validated and largely model pass-through
- [x] Update `docs/system-spec.md` to remove language implying explicit BYOK requires repo-maintained supported model lists
- [x] Keep documentation clear that the gateway still supports only implemented providers, not arbitrary upstream ecosystems

## Risks and Caveats

### Main risk
- If provider-specific format validation is too strict, the gateway will reproduce the same maintenance problem in a slightly different form.

### Secondary risk
- If format validation is too loose, callers may see more upstream-originated model errors. This is acceptable so long as those errors are safely normalized and do not leak secrets.

### OpenRouter caveat
- OpenRouter model identifiers are especially likely to change or expand without notice, so any explicit-BYOK logic that depends on a hardcoded model set will continue to fail valid customer requests.

## Acceptance Criteria

- [x] Hosted/default requests still enforce strict provider/model allowlists.
- [x] Explicit BYOK requests validate provider support and request shape without requiring exact model membership in a static repo catalog.
- [x] Explicit BYOK accepts format-valid, non-catalog model identifiers for supported providers and forwards them upstream unchanged.
- [x] OpenRouter explicit BYOK no longer requires repository updates for newly introduced valid model identifiers.
- [x] Validation, telemetry, and error surfaces continue to protect raw provider credentials.
- [x] Tests and docs clearly reflect the split between strict hosted policy and permissive explicit-BYOK model pass-through.

## Latest Outcome

- [x] Explicit BYOK policy now validates supported providers plus lightweight provider-specific model format rules instead of exact static model membership.
- [x] Hosted/default policy remains strict and continues to enforce configured allowlists plus canonical hosted support checks.
- [x] OpenRouter explicit BYOK now forwards format-valid non-catalog model identifiers upstream unchanged.
- [x] The OpenRouter provider executor no longer blocks explicit BYOK requests on a hardcoded model list.
- [x] Policy and integration coverage now verify permissive explicit-BYOK pass-through behavior and malformed-format rejection behavior.
- [x] `pnpm typecheck` passes.
- [x] `pnpm test` passes.

## Follow-up: Explicit BYOK Must Win Over Bearer Auth

### Observed Integration Gap
- A downstream caller can resolve a request as explicit BYOK while still sending an incidental `Authorization: Bearer ...` header.
- The current `src/runtime/service.ts` branching evaluates hosted/default first, then routes any remaining request with bearer auth into `evaluateExecutionIntent(...)`.
- That means a valid explicit-BYOK request can still be incorrectly pulled into hosted policy evaluation, producing hosted allowlist failures such as `policy-model-not-allowed`.

### Locked Decision
- If request shape is valid explicit BYOK, the gateway must ignore bearer auth and execute via the explicit-BYOK path.
- Missing or empty `X-EG-AI-Provider-Credential` must continue to fail as `request-invalid-shape` rather than degrading into hosted evaluation.

### Follow-up Implementation Checklist
- [x] Update `src/runtime/service.ts` so request-shape routing takes precedence over bearer-auth presence
- [x] Remove the branch that currently routes explicit-BYOK-shaped requests into hosted evaluation when `Authorization` is present
- [x] Add integration coverage proving valid explicit BYOK still executes through BYOK when bearer auth is also present
- [x] Add integration coverage proving explicit BYOK plus bearer auth does not trigger hosted model allowlist failures
- [x] Preserve current invalid-shape semantics for missing or empty BYOK credentials
- [x] Re-run validation commands and record outcomes here

### Follow-up Outcome
- [x] Explicit BYOK routing now wins over incidental bearer auth in `src/runtime/service.ts`.
- [x] Valid explicit BYOK requests no longer fall into hosted model allowlist evaluation when `Authorization` is also present.
- [x] Integration coverage now verifies BYOK-over-bearer precedence for OpenRouter with a non-catalog pass-through model identifier.
- [x] Invalid-shape behavior for missing or empty BYOK credentials remains unchanged.
- [x] `pnpm typecheck` passes after the routing change.
- [x] `pnpm test` passes after the routing change.
