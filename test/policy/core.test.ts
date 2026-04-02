import { describe, expect, it } from 'vitest';
import {
  createGatewayPolicy,
  createTokenClaims,
  evaluateExecutionIntent,
  getSupportedModelsForProvider,
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
    expect(intent.maxOutputTokens).toBe(512);
  });

  it('creates policy defaults from configured credentials and app overrides', () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      AI_GATEWAY_DEFAULT_PROVIDER: 'openai',
      AI_GATEWAY_DEFAULT_MODEL: 'gpt-4o-mini',
      OPENAI_API_KEY: 'openai-key',
      ANTHROPIC_API_KEY: 'anthropic-key',
      GEMINI_API_KEY: 'gemini-key',
      OPENROUTER_API_KEY: 'openrouter-key',
    });

    const policy = createGatewayPolicy(config);
    expect(policy.allowedProviders).toEqual(['openai', 'anthropic', 'gemini', 'openrouter']);
    expect(policy.allowedModelsByProvider).toEqual({
      openai: ['gpt-4o-mini'],
      anthropic: ['claude-3-5-haiku-latest'],
      gemini: ['gemini-2.0-flash'],
      openrouter: ['openai/gpt-4o-mini'],
    });

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
      OPENAI_API_KEY: 'openai-key',
    });
    const claims = createTokenClaims(
      { appId: 'app', clientId: 'client', modelAllowlist: ['gpt-4o'] },
      config,
    );
    const policy = resolveEffectivePolicy(createGatewayPolicy(config), 'app');

    expect(() =>
      evaluateExecutionIntent(
        normalizeAiRequest({ provider: 'openai', model: 'gpt-4o-mini', input: 'hello' }),
        claims,
        {
          ...policy,
          allowedModelsByProvider: { openai: ['gpt-4o-mini'] },
        },
      ),
    ).toThrow(/Requested model .* is not permitted by this token/);

    const unrestrictedClaims = createTokenClaims({ appId: 'app', clientId: 'client' }, config);

    const intent = evaluateExecutionIntent(
      normalizeAiRequest({ input: 'hello', maxOutputTokens: 9999 }),
      unrestrictedClaims,
      {
        ...policy,
        maxOutputTokens: 1000,
      },
    );

    expect(intent.maxOutputTokens).toBe(512);
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
    ).toThrow(/Requested provider .* is not allowed for this hosted route/);
  });

  it('keeps policy allowlists aligned with canonical provider model support', () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      OPENAI_API_KEY: 'openai-key',
      ANTHROPIC_API_KEY: 'anthropic-key',
      GEMINI_API_KEY: 'gemini-key',
      OPENROUTER_API_KEY: 'openrouter-key',
    });

    const policy = createGatewayPolicy(config);

    expect(policy.allowedModelsByProvider.openai).toEqual(getSupportedModelsForProvider('openai'));
    expect(policy.allowedModelsByProvider.anthropic).toEqual(
      getSupportedModelsForProvider('anthropic'),
    );
    expect(policy.allowedModelsByProvider.gemini).toEqual(getSupportedModelsForProvider('gemini'));
    expect(policy.allowedModelsByProvider.openrouter).toEqual(
      getSupportedModelsForProvider('openrouter'),
    );
  });

  it('rejects models that are not in the provider canonical support set even if policy is overridden', () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      OPENROUTER_API_KEY: 'openrouter-key',
      AI_GATEWAY_DEFAULT_PROVIDER: 'openrouter',
      AI_GATEWAY_DEFAULT_MODEL: 'openai/gpt-4o-mini',
    });
    const claims = createTokenClaims({ appId: 'app', clientId: 'client' }, config);

    expect(() =>
      evaluateExecutionIntent(
        normalizeAiRequest({
          provider: 'openrouter',
          model: 'openai/gpt-4o',
          input: 'hello',
        }),
        claims,
        {
          ...resolveEffectivePolicy(createGatewayPolicy(config), 'app'),
          allowedProviders: ['openrouter'],
          allowedModelsByProvider: {
            openrouter: ['openai/gpt-4o'],
          },
        },
      ),
    ).toThrow(/Requested model .* is not supported by provider/);
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
