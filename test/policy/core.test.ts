import { describe, expect, it } from 'vitest';
import {
  createGatewayPolicy,
  createTokenClaims,
  evaluateExecutionIntent,
  loadGatewayConfig,
  normalizeAiRequest,
  resolveEffectivePolicy,
} from '../../src/index.js';

describe('policy core', () => {
  it('normalizes ai requests and resolves execution intent through policy', () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
    });
    const claims = createTokenClaims({ appId: 'app', clientId: 'client' }, config);
    const normalized = normalizeAiRequest({
      input: 'hello world',
      maxOutputTokens: 5000,
    });
    const policy = createGatewayPolicy(config);
    const effectivePolicy = resolveEffectivePolicy(policy, 'app');
    const intent = evaluateExecutionIntent(normalized, claims, effectivePolicy);

    expect(intent.provider).toBe('openai');
    expect(intent.model).toBe('gpt-4o-mini');
    expect(intent.maxOutputTokens).toBe(2048);
  });

  it('creates policy defaults from configured credentials and app overrides', () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      AI_GATEWAY_DEFAULT_PROVIDER: 'openai',
      AI_GATEWAY_DEFAULT_MODEL: 'gpt-4o-mini',
      OPENAI_API_KEY: 'openai-key',
    });

    const policy = createGatewayPolicy(config);
    expect(policy.allowedProviders).toEqual(['openai']);

    const effective = resolveEffectivePolicy(
      {
        ...policy,
        appOverrides: {
          app: {
            allowedProviders: ['openai'],
            allowedModelsByProvider: { openai: ['gpt-4o-mini', 'gpt-4o-nano'] },
            defaultProvider: 'openai',
            defaultModel: 'gpt-4o-nano',
            maxInputTokens: 256,
            maxOutputTokens: 128,
          },
        },
      },
      'app',
    );

    expect(effective.allowedModelsByProvider.openai).toEqual(['gpt-4o-mini', 'gpt-4o-nano']);
    expect(effective.defaultModel).toBe('gpt-4o-nano');
    expect(effective.maxInputTokens).toBe(256);
    expect(effective.maxOutputTokens).toBe(128);
  });

  it('normalizes ai request defaults and rejects missing input', () => {
    expect(
      normalizeAiRequest({
        provider: '  openai  ',
        model: '  gpt-4o-mini  ',
        input: '  hello world  ',
        stream: 1 as unknown as boolean,
      }),
    ).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      input: 'hello world',
      stream: true,
      maxOutputTokens: undefined,
    });

    expect(() => normalizeAiRequest({ input: '   ' })).toThrowError(/input is required/);
  });

  it('rejects token-restricted models and clamps output tokens to the lowest limit', () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
    });
    const claims = createTokenClaims({ appId: 'app', clientId: 'client' }, config);
    const policy = resolveEffectivePolicy(createGatewayPolicy(config), 'app');

    expect(() =>
      evaluateExecutionIntent(
        normalizeAiRequest({ provider: 'openai', model: 'gpt-4o', input: 'hello' }),
        claims,
        {
          ...policy,
          allowedModelsByProvider: { openai: ['gpt-4o-mini', 'gpt-4o'] },
        },
      ),
    ).toThrow(/Model is not permitted by token constraints/);

    const intent = evaluateExecutionIntent(
      normalizeAiRequest({ input: 'hello', maxOutputTokens: 9999 }),
      claims,
      {
        ...policy,
        maxOutputTokens: 1000,
      },
    );

    expect(intent.maxOutputTokens).toBe(1000);
  });

  it('rejects unsupported provider selections', () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
    });
    const claims = createTokenClaims({ appId: 'app', clientId: 'client' }, config);
    const normalized = normalizeAiRequest({
      provider: 'anthropic',
      model: 'claude',
      input: 'hello world',
    });

    expect(() =>
      evaluateExecutionIntent(
        normalized,
        claims,
        resolveEffectivePolicy(createGatewayPolicy(config), 'app'),
      ),
    ).toThrow(/Provider is not allowed/);
  });

  it('rejects input larger than token or policy limits', () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
    });
    const claims = createTokenClaims({ appId: 'app', clientId: 'client' }, config);
    const normalized = normalizeAiRequest({
      input: 'x'.repeat(40_000),
    });

    expect(() =>
      evaluateExecutionIntent(
        normalized,
        claims,
        resolveEffectivePolicy(createGatewayPolicy(config), 'app'),
      ),
    ).toThrow(/Input exceeds allowed size/);
  });
});
