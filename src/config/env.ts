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

  return {
    environment,
    signingSecret: requireSigningSecret(input.AI_GATEWAY_SIGNING_SECRET, environment),
    providerCredentials: collectProviderCredentials(input, environment),
    defaults: {
      tokenTtlSeconds: parsePositiveInt(input.AI_GATEWAY_TOKEN_TTL_SECONDS, 300),
      defaultProvider: input.AI_GATEWAY_DEFAULT_PROVIDER?.trim() || 'openai',
      defaultModel: input.AI_GATEWAY_DEFAULT_MODEL?.trim() || 'gpt-4o-mini',
      maxInputTokens: 8192,
      maxOutputTokens: 2048,
    },
    adapters: {
      rateLimiter: input.AI_GATEWAY_RATE_LIMITER?.trim() || undefined,
      telemetry: input.AI_GATEWAY_TELEMETRY?.trim() || undefined,
      providerRegistry: input.AI_GATEWAY_PROVIDER_REGISTRY?.trim() || undefined,
    },
  };
};
