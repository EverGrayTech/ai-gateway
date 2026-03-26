import { describe, expect, it } from 'vitest';
import { loadGatewayConfig } from '../../src/index.js';

describe('config env', () => {
  it('loads development configuration with safe defaults', () => {
    const config = loadGatewayConfig({ NODE_ENV: 'development' });

    expect(config.environment).toBe('development');
    expect(config.signingSecret).toBe('development-signing-secret');
    expect(config.defaults.defaultProvider).toBe('openai');
    expect(config.defaults.maxInputTokens).toBe(8192);
  });

  it('rejects missing production signing secret', () => {
    expect(() => loadGatewayConfig({ NODE_ENV: 'production' })).toThrowError(
      /AI_GATEWAY_SIGNING_SECRET/,
    );
  });

  it('loads production configuration with trimmed provider credentials and adapter values', () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'production',
      AI_GATEWAY_SIGNING_SECRET: '  prod-secret  ',
      OPENAI_API_KEY: '  openai-key  ',
      OPENAI_BASE_URL: '  https://example.test/v1  ',
      ANTHROPIC_API_KEY: '  anthropic-key  ',
      ANTHROPIC_BASE_URL: '  https://anthropic.example.test/v1  ',
      GEMINI_API_KEY: '  gemini-key  ',
      GEMINI_BASE_URL: '  https://gemini.example.test/v1  ',
      AI_GATEWAY_TOKEN_TTL_SECONDS: '600',
      AI_GATEWAY_DEFAULT_PROVIDER: '  custom-provider  ',
      AI_GATEWAY_DEFAULT_MODEL: '  custom-model  ',
      AI_GATEWAY_RATE_LIMITER: '  redis  ',
      AI_GATEWAY_TELEMETRY: '  otel  ',
      AI_GATEWAY_PROVIDER_REGISTRY: '  registry  ',
    });

    expect(config.environment).toBe('production');
    expect(config.signingSecret).toBe('prod-secret');
    expect(config.providerCredentials).toEqual({
      openai: {
        apiKey: 'openai-key',
        baseUrl: 'https://example.test/v1',
      },
      anthropic: {
        apiKey: 'anthropic-key',
        baseUrl: 'https://anthropic.example.test/v1',
      },
      gemini: {
        apiKey: 'gemini-key',
        baseUrl: 'https://gemini.example.test/v1',
      },
    });
    expect(config.defaults.tokenTtlSeconds).toBe(600);
    expect(config.defaults.defaultProvider).toBe('custom-provider');
    expect(config.defaults.defaultModel).toBe('custom-model');
    expect(config.adapters).toEqual({
      rateLimiter: 'redis',
      telemetry: 'otel',
      providerRegistry: 'registry',
    });
  });

  it('rejects unsupported environments and invalid token ttl values', () => {
    expect(() => loadGatewayConfig({ NODE_ENV: 'staging' })).toThrowError(/Unsupported NODE_ENV/);

    expect(() =>
      loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_TOKEN_TTL_SECONDS: '0',
      }),
    ).toThrowError(/AI_GATEWAY_TOKEN_TTL_SECONDS must be a positive integer/);

    expect(() =>
      loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_TOKEN_TTL_SECONDS: 'abc',
      }),
    ).toThrowError(/AI_GATEWAY_TOKEN_TTL_SECONDS must be a positive integer/);
  });

  it('requires provider credentials in production and uses safe non-production fallbacks', () => {
    expect(() =>
      loadGatewayConfig({
        NODE_ENV: 'production',
        AI_GATEWAY_SIGNING_SECRET: 'prod-secret',
      }),
    ).toThrowError(/At least one provider credential is required in production/);

    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: '  test-secret  ',
      OPENAI_API_KEY: '   ',
      OPENAI_BASE_URL: '   ',
      ANTHROPIC_API_KEY: '   ',
      ANTHROPIC_BASE_URL: '   ',
      GEMINI_API_KEY: '   ',
      GEMINI_BASE_URL: '   ',
      AI_GATEWAY_RATE_LIMITER: '   ',
      AI_GATEWAY_TELEMETRY: '   ',
      AI_GATEWAY_PROVIDER_REGISTRY: '   ',
    });

    expect(config.signingSecret).toBe('test-secret');
    expect(config.providerCredentials).toEqual({});
    expect(config.adapters).toEqual({
      rateLimiter: undefined,
      telemetry: undefined,
      providerRegistry: undefined,
    });
  });
});
