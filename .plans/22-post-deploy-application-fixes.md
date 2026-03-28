# Plan 22: Post-Deploy Application Fixes

## Objective

Track application-level fixes discovered after the Vercel deployment path became operational, starting with client-visible response correctness issues observed from the live hosted gateway.

## Scope Decisions (Locked)

- Focus on application behavior after successful deployment rather than deployment plumbing itself
- Preserve public endpoint shapes and status-code semantics unless explicitly required by a bug fix
- Keep gateway domain logic centralized; only fix incorrect response shaping, runtime handling, or operator-facing application behavior

## Initial Issues Identified

- [x] Validation and other handled client-visible errors should always return structured JSON bodies
- [ ] Confirm `/auth` and `/ai` return operator-usable error payloads in hosted environments

## Recorded Fixes

- [x] Marked JSON gateway responses explicitly as text-bodied responses so hosted runtimes do not drop serialized error payloads
- [x] Explicitly set text response headers at the serverless boundary so serialized error bodies are not emitted as empty responses
- [x] Added a Node-runtime response bridge in `api/[...route].ts` so fetch-style `Response` bodies are written onto the underlying Node response object when Vercel executes the function in Node mode
- [x] Updated the Node response bridge to explicitly consume fetch-style response bodies with `response.text()` before ending the Node response
- [x] Temporarily replaced gateway execution in `api/[...route].ts` with a hard-coded JSON response to isolate whether Vercel is dropping responses before or after the entrypoint return path
- [x] Restored real gateway execution after confirming the entrypoint bridge can return non-empty JSON bodies
- [x] Added explicit entrypoint-level fallback serialization so uncaught failures before the normal gateway response path return visible JSON diagnostics instead of an empty platform 400
- [x] Identified double-consumption of the incoming request body at the Vercel entrypoint boundary and rebuilt a normalized fetch request before invoking the gateway handler
- [x] Replaced the ad hoc request-shape assumptions in `api/[...route].ts` with explicit Node `IncomingMessage` normalization into a real Fetch `Request`, paired with manual Node `ServerResponse` writing
- [x] Stripped the Vercel `/api` function prefix during entrypoint normalization so gateway routing still resolves against `/auth` and `/ai`
- [x] Adjusted Node request-body extraction to read pre-populated `request.body` values before falling back to stream consumption, fixing valid JSON requests that were arriving empty at the gateway
- [x] Expanded Node body extraction to also honor `rawBody` and cloned fetch headers during request normalization to avoid runtime-specific body/headers consumption issues
- [x] Upgraded entrypoint fallback diagnostics to report the failing stage, request kind, normalized path, content type, header keys, body source, and observed body length without exposing secrets
- [x] Confirmed that Vercel's Node `request.body` getter can itself throw `Invalid JSON` and updated the entrypoint to avoid touching that getter entirely, relying only on `rawBody` or the request stream
- [x] Added temporary response headers exposing normalized path, selected body source, and observed body length so live curl output can confirm whether the gateway received any request body at all
- [x] Added actionable diagnostic guidance to normalized gateway error responses so operators can debug failures without first instrumenting the code path
- [x] Extended temporary response diagnostics with a short encoded body preview so live requests can confirm exactly what JSON text reached the gateway boundary
- [x] Confirmed via body preview that the Windows PowerShell curl invocation was rewriting JSON into `{appId:web,clientId:test-client-1}` before transmission, and updated guidance to call out the shell-escaping issue explicitly
