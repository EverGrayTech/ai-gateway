# Plan 23: Runtime and Rate Limiter Follow-ups

## Objective

Track the newly isolated follow-up work after the Vercel request/response path was made operational: production runtime stabilization, diagnostic quality improvements, and the now-confirmed external rate limiter/backend failure path.

## Scope Decisions (Locked)

- Keep the gateway’s `/auth` and `/ai` contract intact
- Treat the Vercel request/response bridge as the active hosting boundary that must remain observable and debuggable
- Preserve actionable error responses so operators do not need to add one-off instrumentation before debugging production issues
- Focus follow-up work on confirmed runtime/backend issues rather than reopening already-resolved body/response-path problems

## Confirmed Outcomes So Far

- [x] Vercel-hosted requests now reach the real gateway handler path
- [x] Handled gateway errors now return structured JSON bodies instead of empty responses
- [x] Node-runtime request normalization and response writing are functioning well enough to expose real application failures
- [x] Client-side PowerShell quoting issues were identified and distinguished from server-side JSON parsing problems through body preview diagnostics

## New Follow-up Work

- [x] Diagnose `RATE_LIMIT_BACKEND_UNAVAILABLE` in production `/auth`
  - confirm whether the active backend is Upstash or another external adapter
  - determine whether the failure is caused by missing configuration, invalid credentials, transport failure, or unexpected backend response shape
  - improve error diagnostics for rate-limiter backend failures so operators get actionable root-cause information immediately

- [ ] Reassess temporary Vercel entrypoint diagnostics
  - decide which debug headers and fallback diagnostics should remain permanently
  - remove or reduce diagnostics that are no longer necessary once the backend issue is resolved
  - retain enough observability to debug future runtime mismatches without ad hoc code changes

- [ ] Validate the hosted happy path end-to-end
  - confirm `/auth` succeeds once the production rate limiter path is healthy
  - validate `/ai` non-streaming execution with a valid bearer token
  - validate `/ai` streaming behavior after auth succeeds

## Maintenance Note

Use this plan for all work that follows from the now-working Vercel runtime bridge and the newly exposed production backend issues. Keep it current as rate limiter fixes, diagnostic cleanups, and hosted validation steps are completed.

## Latest Finding

- [x] The current hosted `/auth` blocker is no longer request parsing; it is the external production rate limiter path
- [x] Rate limiter backend failures now preserve backend-specific detail in the surfaced gateway error message instead of collapsing into an opaque generic message
