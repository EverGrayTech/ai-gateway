# Plan 26: OpenRouter as the Hosted Default Provider

## Objective

Align zero-setup hosted execution with the currently configured provider surface so requests without an explicit provider use OpenRouter instead of OpenAI.

## Deployment and Hosting Constraint Check

- The gateway is a stateless serverless HTTP service
- Hosted defaults are configuration-level behavior and should remain outside policy/auth contract redesign work
- The change must preserve the existing API surface and policy system while only updating fallback provider/model selection

## Scope Decisions (Locked)

- Change only hosted default fallback behavior
- Do not modify the policy system or enforcement model
- Do not change `/auth` or `/ai` request/response contracts
- Keep explicit provider/model requests behaving as they do today
- Ensure the default provider and default model are compatible with configured OpenRouter credentials and canonical provider support

## Required Change

- Locate the gateway default configuration for:
  - `defaultProvider`
  - `defaultModel`
- Update the hosted defaults to:
  - `defaultProvider = "openrouter"`
  - a valid supported OpenRouter default model suitable for low-cost hosted usage
- Confirm that omitted-provider hosted requests now resolve through OpenRouter rather than failing due to OpenAI being the default without credentials

## Implementation Phases

- [x] Update the default provider/model configuration so zero-setup hosted requests fall back to OpenRouter
- [x] Update tests that currently assume OpenAI as the hosted default
- [x] Update downstream-facing docs that describe the hosted default provider/model
- [x] Run repository validation commands and record outcomes here

## Latest Outcome

- [x] Hosted fallback defaults now resolve to OpenRouter with `openai/gpt-4o-mini` when no explicit provider/model is supplied
- [x] Zero-setup integration coverage now exercises the default hosted path through OpenRouter credentials rather than OpenAI credentials
- [x] Consumption docs now describe OpenRouter as the repository hosted default provider
- [x] Remaining explicit OpenAI-path tests were preserved by pinning those scenarios to OpenAI-specific defaults where they intentionally validate OpenAI behavior
- [x] `pnpm typecheck` passes after updating the hosted defaults and related tests
- [x] `pnpm test` passes with coverage thresholds satisfied
