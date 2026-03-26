# Plan: Default Hosted Mode

## Objective
Define and polish the default zero-setup hosted AI experience so users can immediately use the application without supplying provider API keys, while keeping execution strictly bounded through the existing gateway policy, auth, and rate-limiting mechanisms.

## Customer Value
- Delivers an immediate out-of-the-box AI experience with no provider-key setup required from the user
- Preserves strong cost and abuse controls by routing default usage through the gateway’s existing enforcement boundaries
- Coexists cleanly with BYOK flows without exposing provider credentials or fragmenting the integration model

## Scope Decisions (Locked)
- The public `/ai` API contract must remain unchanged
- The default hosted experience must be implemented by tightening and formalizing the existing default policy configuration (`defaultProvider`, `defaultModel`, `maxOutputTokens`, and related existing constraints), not by introducing a separate mode-specific policy system
- All hosted-mode guardrails must be expressed through the existing gateway policy, auth, token, identifier-normalization, and rate-limiting mechanisms
- The gateway must not add parallel configuration paths or gateway-internal branching logic for hosted vs BYOK behavior
- BYOK remains a separate direct-provider integration path outside hosted gateway execution; its selection behavior must be documented as an `@evergraytech/ai-config` integration concern rather than implemented as alternate gateway execution logic
- No new backend systems, billing systems, quotas, user accounts, provider routing, or optimization logic may be introduced in this phase

## Prerequisites
- `docs/system-spec.md`
- `docs/consumption-guide.md`
- `docs/development.md`
- `.plans/14-auth-hardening.md`
- `.plans/15-external-rate-limiting.md`
- `.plans/16-policy-provider-consistency.md`

## Implementation Checklist

### 1. Default Execution Behavior
- [x] Define the zero-setup hosted experience as the existing hosted gateway path with one deterministic default provider and default model selected through current policy defaults
- [x] Ensure requests without user-provided provider credentials follow the hosted default path without requiring additional client-visible setup steps
- [x] Preserve deterministic behavior by explicitly avoiding routing, dynamic provider selection, or provider optimization logic in the hosted default path

### 2. Cost and Usage Guardrails
- [x] Tighten and document default hosted limits through existing policy and token constraints, including bounded `maxOutputTokens` and any related request-size limits appropriate for zero-setup usage
- [x] Ensure `/auth` and `/ai` rate-limiting behavior for the default hosted path remains strict enough to control cost and resist abuse without introducing new enforcement systems
- [x] Prevent escalation of default hosted usage through repeated token issuance by relying on the existing `/auth` hardening and rate-limiting posture rather than inventing a parallel hosted-mode limiter

### 3. Auth Integration
- [x] Define how the existing `/auth` flow supports the zero-setup hosted experience using the current short-lived signed-token model
- [x] Ensure issued hosted tokens are constrained, short-lived, and non-escalatable through existing token claims and policy defaults
- [x] Preserve client-visible simplicity so hosted default usage does not introduce additional auth complexity beyond the current `/auth` and `/ai` sequence

### 4. ai-config Client Experience Integration
- [x] Define the expected integration contract with `@evergraytech/ai-config` so hosted mode is the automatic default when the user has not supplied a provider key
- [x] Define that BYOK selection occurs explicitly when a user provides their own provider credentials, while hosted mode remains the fallback/default path
- [x] Ensure mode switching is seamless and explicit at the `ai-config` layer without creating multiple overlapping gateway configuration paths
- [x] Keep this repo scoped to documenting and supporting the expected behavior contract, not implementing `ai-config` itself

### 5. Mode Separation (Hosted vs BYOK)
- [x] Clearly define hosted execution as gateway-controlled execution using gateway-issued tokens, hosted provider credentials, hosted policy, and hosted rate limiting
- [x] Clearly define BYOK execution as user-controlled direct-provider execution outside the hosted gateway execution path
- [x] Ensure constraints, credentials, and enforcement semantics are never mixed across hosted and BYOK paths
- [x] Avoid introducing gateway branching logic that treats hosted and BYOK as parallel internal execution modes

### 6. Abuse Resistance
- [x] Ensure the default hosted path cannot be used to bypass rate limits, escalate token usage, or exploit differences between providers by relying on the existing policy, auth, identifier normalization, and rate-limiting mechanisms
- [x] Tighten default hosted behavior through existing default policy configuration rather than by adding special-case enforcement code paths
- [x] Confirm that default hosted behavior remains bounded even when users repeatedly request new hosted tokens or omit provider/model fields to rely on defaults

### 7. Observability
- [x] Define operational visibility for hosted default usage volume, rejection rates, and limit-driven denials that may indicate cost-driving behavior
- [x] Ensure observability remains content-safe and does not log raw tokens, provider keys, or sensitive request payloads
- [x] Keep hosted-mode observability aligned with existing gateway telemetry patterns rather than introducing a parallel monitoring subsystem

### 8. Integration with Existing Gateway Architecture
- [x] Confirm the default hosted path remains fully compatible with existing auth, policy enforcement, provider execution, rate limiting, and serverless runtime boundaries
- [x] Ensure the default hosted experience is expressed entirely through current gateway defaults and constraints rather than new abstraction layers or execution branches
- [x] Preserve clean coexistence with future provider integrations while keeping the initial zero-setup default deterministic and narrow

### 9. Testing Strategy
- [x] Add end-to-end tests validating the zero-setup hosted flow works using current `/auth` and `/ai` contracts with omitted provider/model where appropriate
- [x] Add tests proving default hosted limits and rate limits are enforced through the existing gateway enforcement mechanisms
- [x] Add integration-oriented tests for the documented `ai-config` behavior contract, including hosted-by-default expectations and explicit BYOK override behavior at the integration boundary
- [x] Preserve existing gateway behavior coverage so default hosted polishing does not regress current hosted-path contracts or BYOK separation expectations

## Non-Goals
- Introducing a separate hosted-mode policy subsystem or special-case gateway execution branch
- Implementing billing, quotas, user accounts, or other account-based entitlement systems
- Adding provider routing, optimization, or cost-aware model switching behavior
- Implementing `@evergraytech/ai-config` inside this repository rather than defining its integration expectations

## Acceptance Criteria
- [x] A zero-setup hosted experience is clearly defined as the bounded default use of the existing hosted gateway path
- [x] Default hosted behavior is controlled entirely through existing policy defaults, token constraints, and rate-limiting/auth mechanisms rather than a parallel mode-specific system
- [x] Hosted and BYOK paths remain clearly separated, with mode selection defined at the integration boundary and no mixed credential/enforcement behavior inside the gateway
- [x] Cost and abuse controls for default hosted usage are explicit, enforceable, and observable through existing gateway systems
- [x] The public `/ai` contract and overall gateway architecture remain unchanged while the default hosted experience becomes polished and predictable
