# Plan: Auth Token Issuance

## Objective
Define the `/auth` flow for issuing short-lived signed request tokens that bind `appId`, `clientId`, expiration, and gateway-enforced constraints into a verifiable contract for hosted AI execution.

## Customer Value
- Gives client applications a secure, low-friction way to obtain authorization for hosted AI requests without exposing provider keys
- Creates the basis for server-side enforcement of request limits and model restrictions
- Helps prevent abuse by requiring signed, expiring tokens before any hosted execution can occur

## Scope Decisions (Locked)
- v1 token signing will use a shared signing secret provided through environment configuration
- Tokens must be short-lived and include the required claims needed for downstream enforcement
- `/auth` is authorization bootstrap only; it does not execute AI requests or expose sensitive internal configuration
- `appId` and `clientId` are required request inputs, but `appId` is enforcement context rather than a standalone security boundary in v1

## Prerequisites
- `docs/system-spec.md`
- `.plans/01-serverless-service-foundation.md`

## Implementation Checklist

### 1. `/auth` Request Contract
- [x] Define the request and response schema for token issuance, including required `appId` and `clientId` inputs
- [x] Define validation behavior for malformed, missing, or unusable auth requests
- [x] Ensure `/auth` responses return only the signed token and safe metadata needed by clients

### 2. Token Claim Model
- [x] Define the required token claims for expiration, `appId`, `clientId`, and maximum token limits
- [x] Define optional v1 claim support for model allowlists and other future-safe enforcement metadata
- [x] Document token lifetime strategy and how claim defaults are derived from gateway policy/configuration

### 3. Signing and Verification Utilities
- [x] Define reusable token-signing and token-verification interfaces for the gateway runtime
- [x] Ensure signature verification distinguishes invalid signature, expired token, and malformed token failures cleanly
- [x] Keep signing implementation isolated from route handlers so future asymmetric signing can be introduced without broad rewrites

### 4. Abuse Controls Around Issuance
- [x] Define how `/auth` integrates with rate limiting and request-context capture
- [x] Ensure issued tokens cannot exceed server-side maximums even if clients request broader allowances later
- [x] Define safe logging and observability behavior for issuance success, rejection, and suspicious patterns

### 5. Test Coverage for Auth Behavior
- [x] Cover successful issuance flows for valid requests
- [x] Cover rejection cases for malformed inputs, expired verification attempts, and invalid signatures
- [x] Verify token contents and enforcement metadata are stable enough for downstream `/ai` consumption

## Acceptance Criteria
- [x] `/auth` issues short-lived signed tokens for valid `appId` and `clientId` requests
- [x] Tokens encode the required enforcement claims and can be verified consistently by downstream handlers
- [x] Invalid, malformed, or expired tokens are distinguishable during verification without exposing sensitive details
- [x] `/auth` integrates cleanly with request context, rate limiting, and observability hooks
- [x] The signing utility is portable and does not lock the service to one runtime-specific implementation detail
