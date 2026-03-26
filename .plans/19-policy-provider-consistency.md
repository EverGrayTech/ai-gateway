# Plan: Policy Provider Consistency

## Objective
Ensure strict consistency between gateway policy enforcement and provider execution behavior across OpenAI, Anthropic, Gemini, and OpenRouter so that policy remains authoritative and provider executors uniformly respect gateway decisions.

## Customer Value
- Makes provider behavior predictable and consistent for downstream applications regardless of which approved provider is selected
- Reduces mismatches where policy appears to allow a request that a provider cannot execute, or where a provider would execute behavior policy did not explicitly allow
- Strengthens the gateway’s role as the single enforcement boundary across all supported providers

## Scope Decisions (Locked)
- Policy remains the single source of truth for allowed providers, allowed models, and request constraints such as token limits
- Provider executors must not reinterpret, broaden, or override policy decisions; they are responsible for execution of already-approved intent and executor-local capability alignment only
- The public `/ai` API contract must remain unchanged
- No new policy system or abstraction layer may be introduced; this phase is limited to alignment, validation, and limited centralization/documentation of canonical gateway model identity
- Provider-specific naming schemes, streaming semantics, or capability details must not leak into shared policy behavior beyond explicitly documented canonical gateway model identities
- OpenRouter must remain policy-bounded and must not function as a loophole for bypassing provider/model governance

## Prerequisites
- `docs/system-spec.md`
- `docs/development.md`
- `.plans/03-policy-and-enforcement-core.md`
- `.plans/12-openai-real-upstream-integration.md`
- `.plans/anthropic-provider-integration.md`
- `.plans/gemini-provider-integration.md`
- `.plans/openrouter-provider-integration.md`

## Implementation Checklist

### 1. Current State Analysis
- [ ] Analyze how provider allowlists, model definitions, and provider metadata are currently defined across policy configuration, provider metadata, and executor behavior
- [ ] Identify existing inconsistencies such as incomplete `allowedModelsByProvider` coverage, duplicated model truth, or provider-specific expectations that differ from policy assumptions
- [ ] Document where current behavior allows policy/executor drift and which mismatches must be eliminated in this phase

### 2. Canonical Model Identity Consistency
- [ ] Define and document a canonical gateway-level model identity representation used by policy, provider metadata, and execution intent across all providers
- [ ] Add limited centralization so all supported providers map to and from this canonical representation consistently without redesigning the policy system
- [ ] Ensure provider-native naming details are adapted internally and do not redefine policy decisions outside the documented gateway-level model identity

### 3. Policy vs Provider Responsibility Boundary
- [ ] Clearly define policy responsibility for allow/deny decisions, model governance, and constraint enforcement
- [ ] Clearly define provider executor responsibility as execution of already-approved requests plus executor-local capability checks that must not conflict with policy authority
- [ ] Ensure provider executors do not perform independent validation that silently narrows, broadens, or reclassifies policy decisions in inconsistent ways

### 4. Allowlist Alignment
- [ ] Ensure `allowedModelsByProvider` or its equivalent is fully populated and coherent for OpenAI, Anthropic, Gemini, and OpenRouter
- [ ] Align policy allowlists with real provider executor capabilities so policy cannot allow a model no executor supports and executors cannot run a model policy does not explicitly allow
- [ ] Define a maintainable process for keeping provider metadata and policy allowlists in sync without introducing a new abstraction layer

### 5. Constraint Consistency
- [ ] Validate that constraints such as `maxOutputTokens` are interpreted and enforced consistently regardless of provider
- [ ] Ensure provider executors do not silently modify, ignore, or expand policy-authorized limits during request mapping or upstream execution
- [ ] Confirm the execution intent handed to providers is the authoritative constrained form of the request and remains stable across providers

### 6. Error Behavior Alignment
- [ ] Ensure policy violations are always caught before provider execution begins
- [ ] Ensure provider-originated failures remain upstream errors and do not masquerade as policy errors, while policy errors do not leak through as provider execution failures
- [ ] Preserve consistent error semantics across providers for disallowed providers, disallowed models, constraint violations, and upstream execution failures

### 7. OpenRouter-Specific Safeguards
- [ ] Ensure OpenRouter cannot be used to bypass provider/model allowlists or gain access to models not explicitly governed by gateway policy
- [ ] Ensure routed-upstream behavior remains bounded by the same gateway policy rules that apply to direct providers
- [ ] Validate that OpenRouter model identifiers are governed as canonical policy identities rather than treated as unrestricted passthrough strings

### 8. Integration with Existing System
- [ ] Confirm consistency work remains compatible with the existing auth/token model, rate limiting flow, runtime service behavior, and provider executor interchangeability
- [ ] Preserve the current execution flow where policy evaluation produces authoritative execution intent before provider invocation
- [ ] Avoid introducing provider-specific logic into shared gateway service, policy, or runtime layers beyond the limited centralization needed for canonical model identity

### 9. Testing Strategy
- [ ] Add tests validating that equivalent allowed/disallowed requests behave consistently across providers in outcome class
- [ ] Add tests proving policy rejection occurs before provider execution and that disallowed models are never executed by any provider
- [ ] Add cross-provider consistency tests for provider/model allowlist coverage, constraint enforcement, and error classification behavior
- [ ] Include OpenRouter-specific tests ensuring routed model access cannot bypass policy governance

## Non-Goals
- Redesigning the policy system or introducing new abstraction layers
- Expanding the client-facing `/ai` contract or exposing provider-native model semantics to clients
- Implementing cross-provider routing, fallback behavior, capability negotiation, or optimization logic

## Acceptance Criteria
- [ ] Policy is the authoritative source of truth for provider/model access and request constraints across all supported providers
- [ ] Canonical model identity is documented and applied consistently across policy, provider metadata, and provider execution
- [ ] No provider executor can execute a provider/model combination not explicitly allowed by policy, and policy does not allow combinations unsupported by executors
- [ ] Constraint and error semantics remain consistent across providers, including OpenRouter boundedness safeguards
- [ ] Cross-provider tests validate predictable and uniform gateway behavior without changing the public `/ai` API
