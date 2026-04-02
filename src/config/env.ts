import type {
  GatewayConfig,
  GatewayEnvInput,
  ProviderCredentialSet,
  RuntimeEnvironment,
} from '../contracts/config.js';
import { validationError } from '../errors/factories.js';

const ALLOWED_ENVIRONMENTS: readonly RuntimeEnvironment[] = ['development', 'test', 'production'];

const parseEnvironment = (value?: string): RuntimeEnvironment => {
  const normalized = value ?? 'development';

  if (ALLOWED_ENVIRONMENTS.includes(normalized as RuntimeEnvironment)) {
    return normalized as RuntimeEnvironment;
  }

  throw validationError(`Unsupported NODE_ENV: ${normalized}`, 'INVALID_ENVIRONMENT');
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw validationError(
      'AI_GATEWAY_TOKEN_TTL_SECONDS must be a positive integer',
      'INVALID_TOKEN_TTL',
    );
  }

  return parsed;
};

const parseAllowedOrigins = (value: string | undefined): readonly string[] => {
  if (!value?.trim()) {
    return ['http://localhost:5173'];
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return origins.length > 0 ? origins : ['http://localhost:5173'];
};

const requireSigningSecret = (
  value: string | undefined,
  environment: RuntimeEnvironment,
): string => {
  if (value?.trim()) {
    return value.trim();
  }

  if (environment !== 'production') {
    return 'development-signing-secret';
  }

  throw validationError(
    'AI_GATEWAY_SIGNING_SECRET is required in production',
    'MISSING_SIGNING_SECRET',
  );
};

const collectProviderCredentials = (
  input: GatewayEnvInput,
  environment: RuntimeEnvironment,
): Readonly<Record<string, ProviderCredentialSet>> => {
  const credentials: Record<string, ProviderCredentialSet> = {};

  if (input.OPENAI_API_KEY?.trim()) {
    credentials.openai = {
      apiKey: input.OPENAI_API_KEY.trim(),
      baseUrl: input.OPENAI_BASE_URL?.trim() || undefined,
    };
  }

  if (input.ANTHROPIC_API_KEY?.trim()) {
    credentials.anthropic = {
      apiKey: input.ANTHROPIC_API_KEY.trim(),
      baseUrl: input.ANTHROPIC_BASE_URL?.trim() || undefined,
    };
  }

  if (input.GEMINI_API_KEY?.trim()) {
    credentials.gemini = {
      apiKey: input.GEMINI_API_KEY.trim(),
      baseUrl: input.GEMINI_BASE_URL?.trim() || undefined,
    };
  }

  if (input.OPENROUTER_API_KEY?.trim()) {
    credentials.openrouter = {
      apiKey: input.OPENROUTER_API_KEY.trim(),
      baseUrl: input.OPENROUTER_BASE_URL?.trim() || undefined,
    };
  }

  if (environment === 'production' && Object.keys(credentials).length === 0) {
    throw validationError(
      'At least one provider credential is required in production',
      'MISSING_PROVIDER_CREDENTIALS',
    );
  }

  return credentials;
};

export const loadGatewayConfig = (input: GatewayEnvInput = process.env): GatewayConfig => {
  const environment = parseEnvironment(input.NODE_ENV);
  const configuredRateLimiter = input.AI_GATEWAY_RATE_LIMITER?.trim() || undefined;
  const upstashUrl = input.UPSTASH_REDIS_REST_URL?.trim() || undefined;
  const upstashToken = input.UPSTASH_REDIS_REST_TOKEN?.trim() || undefined;
  const inferredRateLimiter = configuredRateLimiter ?? (upstashUrl && upstashToken ? 'upstash' : undefined);
  const inferredRateLimiterUrl =
    input.AI_GATEWAY_RATE_LIMITER_URL?.trim() || upstashUrl || undefined;
  const inferredRateLimiterToken = upstashToken;

  return {
    environment,
    signingSecret: requireSigningSecret(input.AI_GATEWAY_SIGNING_SECRET, environment),
    providerCredentials: collectProviderCredentials(input, environment),
    defaults: {
      tokenTtlSeconds: parsePositiveInt(input.AI_GATEWAY_TOKEN_TTL_SECONDS, 300),
      defaultProvider: input.AI_GATEWAY_DEFAULT_PROVIDER?.trim() || 'openrouter',
      defaultModel: input.AI_GATEWAY_DEFAULT_MODEL?.trim() || 'openai/gpt-4o-mini',
      maxInputTokens: parsePositiveInt(input.AI_GATEWAY_MAX_INPUT_TOKENS, 4096),
      maxOutputTokens: parsePositiveInt(input.AI_GATEWAY_MAX_OUTPUT_TOKENS, 512),
    },
    adapters: {
      rateLimiter: inferredRateLimiter,
      rateLimiterUrl: inferredRateLimiterUrl,
      rateLimiterToken: inferredRateLimiterToken,
      telemetry: input.AI_GATEWAY_TELEMETRY?.trim() || undefined,
      providerRegistry: input.AI_GATEWAY_PROVIDER_REGISTRY?.trim() || undefined,
      allowedOrigins: parseAllowedOrigins(input.AI_GATEWAY_ALLOWED_ORIGINS),
    },
  };
};
