# Plan 24: CORS Support for the Serverless Adapter

## Objective

Allow approved browser-based clients to call the hosted gateway through the serverless boundary without changing core gateway logic, enforcement behavior, or the security model.

## Deployment and Hosting Constraint Check

- The gateway is a stateless serverless HTTP service
- Runtime-specific behavior belongs at the adapter boundary
- CORS must therefore be implemented in the serverless adapter or entrypoint wrapper rather than inside auth, policy, or provider execution layers

## Scope Decisions (Locked)

- Add CORS handling only at the serverless boundary
- Preserve the existing `/auth` and `/ai` gateway contracts
- Keep origin matching explicit and configuration-driven
- Reflect the concrete allowed request origin instead of using `Access-Control-Allow-Origin: *`
- Apply the same CORS behavior to standard responses, streamed responses, and handled error responses returned by the adapter

## Required Behavior

- Read `AI_GATEWAY_ALLOWED_ORIGINS` as a comma-separated allowlist
- Default to `http://localhost:5173` when the env var is unset
- Support both:
  - exact origin matches
  - wildcard subdomain matches such as `https://*.evergraytech.com`
- Treat wildcard entries as suffix-based subdomain matches after parsing the incoming `Origin`
- On allowed origins, reflect the actual request origin in `Access-Control-Allow-Origin`
- On disallowed origins, omit `Access-Control-Allow-Origin`
- Add these headers on adapter responses:
  - `Access-Control-Allow-Methods: POST, OPTIONS`
  - `Access-Control-Allow-Headers: content-type, authorization`
  - `Vary: Origin`
- Short-circuit `OPTIONS` requests with `200` and CORS headers without invoking gateway logic

## Implementation Phases

- [x] Add adapter-scoped origin parsing and matching utilities for exact and wildcard subdomain patterns
- [x] Update the serverless handler to short-circuit preflight and attach CORS headers to all adapter responses
- [x] Extend integration coverage for default origin behavior, configured exact matches, wildcard matches, rejected origins, preflight bypass, and error responses
- [x] Run repository validation commands and keep this plan current with outcomes

## Latest Outcome

- [x] `AI_GATEWAY_ALLOWED_ORIGINS` is now parsed at config load with a default localhost allowlist for local browser development
- [x] The serverless adapter now handles preflight at the boundary and attaches CORS headers to standard, streaming, success, and handled error responses
- [x] Integration coverage now exercises default allowlist behavior, exact matches, wildcard subdomain matches, rejected origins, preflight short-circuiting, and handled error responses
- [x] `pnpm typecheck` passes after the adapter updates
- [x] `pnpm test` passes functionally, but the repository still exits non-zero because the pre-existing global coverage threshold remains below 80% overall
