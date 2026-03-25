# Frontend and Consumer Integration Notes

## Scope
- This repository primarily contains a backend gateway package rather than a frontend application
- Frontend-facing guidance in this repo should focus on how client apps integrate with the gateway contract

## Client Integration Principles
- Treat the gateway as the hosted execution path behind higher-level client libraries and app code
- Send `appId` and a persistent `clientId` with gateway-related flows
- Never expose hosted provider API keys in browser code
- Handle signed tokens and gateway responses as untrusted network data that must be validated by the client integration layer

## Documentation Expectations
- Keep consumer-facing examples aligned with the gateway API contract and package exports
- Prefer framework-agnostic guidance unless a framework-specific integration is intentionally added to this repository
- Avoid implying that browser clients call upstream providers directly when the hosted gateway path is in use
