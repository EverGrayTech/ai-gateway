# Plan 25: Structured Gateway Error Responses

## Objective

Return consistent, explicit, and diagnosable non-2xx error responses from `/auth` and `/ai` so downstream packages such as `@evergraytech/ai-config` can preserve gateway failure details without guessing from status codes or vague messages.

## Deployment and Hosting Constraint Check

- The gateway is a stateless serverless HTTP service
- Error classification and response shaping belong in portable gateway/runtime response normalization, not in frontend consumers
- The structured error envelope must remain safe for hosted clients and must not expose secrets, signed tokens, provider credentials, or unsafe internal implementation details

## Scope Decisions (Locked)

- Keep the existing hosted `/auth` and `/ai` route contract intact for success responses
- Standardize non-2xx responses across both endpoints with one consistent JSON envelope
- Preserve HTTP status semantics while adding stable machine-readable codes, broad categories, retryability, and safe structured details
- Prefer explicit gateway-defined codes over requiring downstream packages to infer meaning from messages or raw status codes
- Limit surfaced details to safe debugging context such as appId, provider, model, reason, and similar non-sensitive metadata

## Desired Error Posture

- Non-2xx responses should use a consistent JSON envelope that includes:
  - `ok: false`
  - stable machine-readable `code`
  - human-readable `message`
  - broad `category`
  - numeric `status`
  - boolean `retryable`
  - safe `details` object when available
- `/auth` and `/ai` should share the same response shape so downstream consumers do not need endpoint-specific parsing logic
- 403 responses, especially policy rejections, should distinguish provider, model, app, and other rejection causes with specific codes and messages

## Implementation Phases

- [x] Audit the current gateway error model, factories, and normalization path to identify where status, category, message exposure, and diagnostics are defined today
- [x] Introduce a richer portable gateway error contract that can carry stable downstream-facing code, retryability, and safe structured details without leaking sensitive data
- [x] Update auth, token, validation, policy, rate-limit, provider, and internal failure paths to emit more specific structured error metadata
- [x] Replace the current error response envelope normalization with the new consistent non-2xx shape across `/auth` and `/ai`
- [x] Expand tests for normalization and integration behavior so downstream consumers can distinguish auth, validation, policy, rate-limit, provider, and internal failures reliably
- [x] Run repository validation commands and record outcomes here

## Latest Outcome

- [x] Non-2xx gateway responses now return a shared envelope with `ok`, `code`, `message`, `category`, `status`, `retryable`, `requestId`, and safe `details`
- [x] `/auth` validation failures now surface stable machine-readable identifier-specific codes
- [x] `/ai` authentication and policy failures now surface explicit downstream-usable codes such as `token-missing`, `token-invalid`, and `policy-model-not-allowed`
- [x] Tests were updated to validate the new structured response posture and the revised internal error contracts
- [x] `pnpm typecheck` passes with the structured error changes
- [x] `pnpm test` passes functionally across the suite, but the repository still exits non-zero because the global coverage threshold remains below 80% overall

## Anticipated Work Areas

- `src/errors/`
  - enrich `GatewayError` metadata
  - update factories and normalization
- `src/runtime/service.ts`
  - preserve context that can safely populate structured error details
- `src/contracts/`
  - update error response typing if needed for the new envelope
- `src/policy/` and request normalization paths
  - replace ambiguous shared codes such as generic unsupported model/policy rejections with more specific policy-oriented codes where appropriate
- `test/errors/normalize.test.ts`
  - assert the new normalized envelope fields
- `test/integration/gateway-api.test.ts`
  - verify `/auth` and `/ai` return consistent explicit error bodies in real request flows
