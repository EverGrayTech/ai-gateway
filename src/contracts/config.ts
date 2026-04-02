export type RuntimeEnvironment = 'development' | 'test' | 'production';

export interface ProviderCredentialSet {
  apiKey: string;
  baseUrl?: string;
}

export interface GatewayDefaults {
  tokenTtlSeconds: number;
  defaultProvider: string;
  defaultModel: string;
  maxInputTokens: number;
  maxOutputTokens: number;
}

export interface AdapterBindings {
  rateLimiter?: string;
  rateLimiterUrl?: string;
  rateLimiterToken?: string;
  telemetry?: string;
  providerRegistry?: string;
  allowedOrigins?: readonly string[];
}

export interface GatewayConfig {
  environment: RuntimeEnvironment;
  signingSecret: string;
  providerCredentials: Readonly<Record<string, ProviderCredentialSet>>;
  defaults: GatewayDefaults;
  adapters: AdapterBindings;
}

export interface GatewayEnvInput {
  NODE_ENV?: string;
  AI_GATEWAY_SIGNING_SECRET?: string;
  AI_GATEWAY_DEFAULT_PROVIDER?: string;
  AI_GATEWAY_DEFAULT_MODEL?: string;
  AI_GATEWAY_TOKEN_TTL_SECONDS?: string;
  AI_GATEWAY_MAX_INPUT_TOKENS?: string;
  AI_GATEWAY_MAX_OUTPUT_TOKENS?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_BASE_URL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_BASE_URL?: string;
  AI_GATEWAY_RATE_LIMITER?: string;
  AI_GATEWAY_RATE_LIMITER_URL?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  AI_GATEWAY_TELEMETRY?: string;
  AI_GATEWAY_PROVIDER_REGISTRY?: string;
  AI_GATEWAY_ALLOWED_ORIGINS?: string;
}
