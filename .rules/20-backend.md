# Backend Standards

## Technology Stack
- **Language**: TypeScript
- **Runtime Target**: Serverless HTTP runtimes
- **Package Manager**: pnpm (use `pnpm` for all operations)
- **Linting/Formatting**: Biome (`pnpm biome check .`)
- **Testing**: Vitest

## Code Organization
- Keep core gateway logic framework-agnostic and runtime-portable
- Isolate serverless adapter code from domain logic, policy logic, and provider integrations
- Prefer small, composable modules with explicit contracts between request handling, enforcement, provider execution, and infrastructure adapters
- Use strict TypeScript typing throughout

## Validation and Contracts
- Define explicit request, response, configuration, and policy contracts in TypeScript
- Validate untrusted input at the boundary of the system
- Keep normalized internal data shapes separate from raw external payloads

## Architecture Principles
- Keep the service stateless and horizontally scalable
- Do not rely on in-memory coordination for production behavior that must survive across requests or instances
- Put external concerns such as rate limiting, telemetry, and provider access behind replaceable interfaces
- Treat streaming support as a first-class backend concern
- Never leak provider credentials, raw signed tokens, or sensitive request data in responses or logs
