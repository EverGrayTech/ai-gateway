import { describe, expect, it } from 'vitest';
import {
  HmacTokenSigner,
  NoopRateLimiter,
  NoopTelemetry,
  StubProviderExecutor,
  type TelemetryRecord,
  createGatewayPolicy,
  createGatewayService,
  createLogger,
  createRateLimitKey,
  createRequestContext,
  createServerlessHandler,
  createTokenClaims,
  evaluateExecutionIntent,
  loadGatewayConfig,
  normalizeAiRequest,
  normalizeErrorResponse,
  redactFields,
  resolveEffectivePolicy,
  validationError,
} from '../src/index.js';

describe('gateway foundation', () => {
  it('loads development configuration with safe defaults', () => {
    const config = loadGatewayConfig({ NODE_ENV: 'development' });

    expect(config.environment).toBe('development');
    expect(config.signingSecret).toBe('development-signing-secret');
    expect(config.defaults.defaultProvider).toBe('openai');
    expect(config.defaults.maxInputTokens).toBe(8192);
  });

  it('creates signed token claims with enforcement metadata', async () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
    });
    const signer = new HmacTokenSigner(config.signingSecret);
    const claims = createTokenClaims({ appId: 'app', clientId: 'client' }, config, new Date());
    const token = await signer.sign(claims);
    const verified = await signer.verify(token);

    expect(verified.claims.appId).toBe('app');
    expect(verified.claims.clientId).toBe('client');
    expect(verified.claims.constraints.maxInputTokens).toBe(8192);
    expect(verified.claims.constraints.maxOutputTokens).toBe(2048);
    expect(verified.claims.constraints.modelAllowlist).toEqual(['gpt-4o-mini']);
  });

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

  it('creates stable rate limit keys from endpoint, client, and ip context', () => {
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/auth',
        headers: {},
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
        remoteAddress: '127.0.0.1',
      },
      loadGatewayConfig({ NODE_ENV: 'test' }),
      { appId: 'app', clientId: 'client' },
    );

    const key = createRateLimitKey('/auth', context, {
      method: 'POST',
      path: '/auth',
      headers: {},
      body: '{}',
      remoteAddress: '127.0.0.1',
    });

    expect(key).toBe('/auth:client:127.0.0.1');
  });

  it('redacts sensitive fields before logging or telemetry', () => {
    expect(
      redactFields({
        authorization: 'Bearer secret',
        token: 'abc',
        prompt: 'hello',
        clientId: 'client',
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      token: '[REDACTED]',
      prompt: '[REDACTED]',
      clientId: 'client',
    });
  });

  it('enforces hard rate limits for repeated auth requests and records telemetry', async () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
    });
    const telemetry = new NoopTelemetry();
    const service = createGatewayService({
      config,
      logger: createLogger(),
      rateLimiter: new NoopRateLimiter(),
      telemetry,
      providerExecutor: new StubProviderExecutor(),
    });

    for (let i = 0; i < 10; i += 1) {
      const result = await service.handle({
        method: 'POST',
        path: '/auth',
        headers: {},
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
        remoteAddress: '127.0.0.1',
      });
      expect(result.kind).toBe('response');
    }

    const blocked = await service.handle({
      method: 'POST',
      path: '/auth',
      headers: {},
      body: JSON.stringify({ appId: 'app', clientId: 'client' }),
      remoteAddress: '127.0.0.1',
    });

    expect(blocked.kind).toBe('response');
    if (blocked.kind !== 'response') {
      throw new Error('expected standard response');
    }

    expect(blocked.response.status).toBe(429);
    const records = await telemetry.flush();
    expect(records.some((record: TelemetryRecord) => record.event === 'rate_limit.exceeded')).toBe(
      true,
    );
  });

  it('rejects invalid token signatures distinctly', async () => {
    const signer = new HmacTokenSigner('test-secret');

    await expect(signer.verify('abc.def.ghi')).rejects.toMatchObject({
      code: 'INVALID_TOKEN_SIGNATURE',
    });
  });

  it('rejects expired tokens distinctly', async () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
    });
    const signer = new HmacTokenSigner(config.signingSecret);
    const expiredClaims = createTokenClaims(
      { appId: 'app', clientId: 'client' },
      config,
      new Date(Date.now() - 600_000),
    );
    const token = await signer.sign(expiredClaims);

    await expect(signer.verify(token)).rejects.toMatchObject({
      code: 'EXPIRED_TOKEN',
    });
  });

  it('rejects missing production signing secret', () => {
    expect(() => loadGatewayConfig({ NODE_ENV: 'production' })).toThrowError(
      /AI_GATEWAY_SIGNING_SECRET/,
    );
  });

  it('creates normalized request context', () => {
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/auth',
        headers: {
          'x-correlation-id': 'corr-123',
          'user-agent': 'vitest',
        },
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
        remoteAddress: '127.0.0.1',
      },
      loadGatewayConfig({ NODE_ENV: 'test' }),
      { appId: 'app', clientId: 'client' },
    );

    expect(context.identity.appId).toBe('app');
    expect(context.network.ip).toBe('127.0.0.1');
    expect(context.tracing.correlationId).toBe('corr-123');
  });

  it('normalizes safe error responses', () => {
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/auth',
        headers: {},
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
      },
      loadGatewayConfig({ NODE_ENV: 'test' }),
      { appId: 'app', clientId: 'client' },
    );

    const normalized = normalizeErrorResponse(
      validationError('bad payload', 'BAD_PAYLOAD'),
      context,
    );

    expect(normalized.status).toBe(400);
    expect(normalized.body.error.code).toBe('BAD_PAYLOAD');
    expect(normalized.body.error.requestId).toBe(context.runtime.requestId);
  });

  it('handles auth and ai requests through the shared service pipeline', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      }),
    });

    const authResult = await service.handle({
      method: 'POST',
      path: '/auth',
      headers: {},
      body: JSON.stringify({ appId: 'app', clientId: 'client' }),
    });

    expect(authResult.kind).toBe('response');
    if (authResult.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const authBody = JSON.parse(authResult.response.body) as {
      token: string;
      issuedAt: string;
      expiresAt: string;
    };
    expect(authBody.issuedAt).toBeTruthy();
    expect(authBody.expiresAt).toBeTruthy();

    const aiResult = await service.handle({
      method: 'POST',
      path: '/ai',
      headers: {
        authorization: `Bearer ${authBody.token}`,
      },
      body: JSON.stringify({ provider: 'openai', model: 'gpt-4o-mini', input: 'hello' }),
    });

    expect(aiResult.kind).toBe('response');
    if (aiResult.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const aiBody = JSON.parse(aiResult.response.body) as { output: string };
    expect(aiBody.output).toContain('stub:openai:gpt-4o-mini:2048:hello');
  });

  it('supports streaming-capable responses through the serverless adapter', async () => {
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      }),
    });

    const authResponse = await handler({
      method: 'POST',
      url: 'https://example.test/auth',
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ appId: 'app', clientId: 'client' }),
    });
    const authBody = (await authResponse.json()) as { token: string };

    const streamResponse = await handler({
      method: 'POST',
      url: 'https://example.test/ai',
      headers: new Headers({ authorization: `Bearer ${authBody.token}` }),
      text: async () =>
        JSON.stringify({ provider: 'openai', model: 'gpt-4o-mini', input: 'hello', stream: true }),
    });

    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get('content-type')).toContain('text/event-stream');
  });
});
