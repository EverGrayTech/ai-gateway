# Plan 21: Deploy to Vercel

## Objective

Deploy `@evergraytech/ai-gateway` to Vercel as a functions-only hosted service, preserving the gateway’s existing `/auth` and `/ai` contract while adapting repository entrypoints and deployment wiring to Vercel’s hosting model.

## Scope Decisions (Locked)

- The public gateway API contract remains `/auth` and `/ai`
- Core gateway logic, enforcement flow, and provider abstractions remain centralized in `src/`
- Vercel-specific deployment wiring is isolated to deployment entrypoints and configuration
- Production deployment must remain stateless and use externalized infrastructure for signing secrets, provider credentials, and durable rate limiting

## Changes Recorded After `e5d0f0f6ea500c26229020881a56d24b5f7f93a6`

- [x] Added Vercel-facing API entrypoints under `api/`
  - `api/[...route].ts` added as the initial catch-all serverless bridge
  - `api/auth.ts` added as an explicit Vercel function entrypoint for auth requests
  - `api/ai.ts` added as an explicit Vercel function entrypoint for AI requests
  - explicit `api/auth.ts` and `api/ai.ts` files were later removed to return to a single edge catch-all entrypoint

- [x] Added and iterated Vercel deployment configuration in `vercel.json`
  - configured the repository for Vercel-hosted function deployment
  - moved to explicit legacy builder configuration to prevent static-output inference
  - declared explicit build targets for `api/auth.ts` and `api/ai.ts`
  - added route mappings for `/api/auth`, `/api/ai`, `/auth`, and `/ai`
  - later removed legacy Node builder configuration to restore fetch-compatible Edge runtime inference through `api/[...route].ts`
  - later simplified `vercel.json` back to a minimal framework-neutral shape for edge-only deployment
  - then switched to explicit catch-all `routes` targeting `/api/[...route]` to keep Vercel in API-routing mode without introducing Node builders
  - added explicit empty build command and `outputDirectory: "."` to stop Vercel from falling back to static `public` output validation while keeping edge-style catch-all routing
  - then switched to an explicit `functions` declaration for `api/[...route].ts` with `runtime: "edge"` to force fetch-compatible execution without Node builders
  - reverted the invalid `functions.runtime = "edge"` declaration after Vercel rejected it, returning to catch-all `routes` plus explicit build/output overrides

- [x] Preserved gateway runtime routing behind the existing adapter
  - all Vercel entrypoints forward requests into `createServerlessHandler()`
  - no duplication of gateway auth or AI execution logic was introduced
  - reverted temporary explicit `api/auth.ts` and `api/ai.ts` files after restoring edge-style deployment

- [x] Added production Upstash rate limiter detection and initialization
  - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are now recognized as external rate limiter wiring
  - config loading now infers `upstash` as the external rate limiter backend when those variables are present
  - a dedicated `UpstashRateLimiterStore` was added to call the Upstash REST pipeline
  - production no longer depends on a separate manual rate limiter flag when Upstash variables are provided

- [x] Updated configuration types and tests for deployment-related wiring
  - extended adapter bindings with rate limiter token support
  - extended environment input typing for Upstash variables
  - added test coverage for inferred Upstash configuration

- [x] Updated deployment/operator documentation
  - documented Upstash environment variables in `docs/development.md`

- [x] Hardened serverless request URL normalization for mixed serverless runtime inputs
  - `src/serverless/adapter.ts` now resolves relative request URLs such as `/api/auth`
  - relative URLs are normalized using forwarded protocol and host headers before gateway routing
  - existing absolute-URL behavior remains intact for edge-style runtimes

- [x] Added Node-runtime compatibility to the serverless adapter
  - the adapter now accepts both Fetch-style requests and Node-style request objects
  - Node header objects are normalized behind a `.get()`-compatible accessor
  - Node request URLs and headers are converted into the same gateway request shape used by edge runtimes

## Current Deployment Notes

- Vercel deployment has completed successfully with the current repository configuration
- `/api/auth` has been confirmed to invoke the deployed function
- A missing `AI_GATEWAY_SIGNING_SECRET` was identified and surfaced through deployment logs
- Root-path routing (`/auth` and `/ai`) has been wired through Vercel routing configuration and should continue to be validated against deployed behavior

## Follow-up Validation

- [ ] Confirm `AI_GATEWAY_SIGNING_SECRET` is configured in Vercel production
- [ ] Confirm provider credentials are configured in Vercel production
- [ ] Confirm Upstash variables are configured in Vercel production
- [ ] Validate `POST /api/auth` returns a signed token successfully
- [ ] Validate `POST /api/ai` succeeds with configured provider credentials
- [ ] Validate root-path aliases `POST /auth` and `POST /ai`
- [ ] Verify streaming behavior on deployed `/ai`
