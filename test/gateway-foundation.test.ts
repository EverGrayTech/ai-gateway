import { describe, expect, it, vi } from 'vitest';
import {
  GatewayError,
  HmacTokenSigner,
  NoopRateLimiter,
  NoopTelemetry,
  OpenAiProviderExecutor,
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
  toGatewayError,
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

  it('tracks rate limit windows and exposes telemetry/provider stub data', async () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
    });
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/auth',
        headers: {},
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
      },
      config,
      { appId: 'app', clientId: 'client' },
    );

    const limiter = new NoopRateLimiter();
    const descriptor = {
      key: 'auth:client',
      limit: 2,
      windowSeconds: 60,
    };

    await expect(limiter.check(descriptor, context, { method: 'POST', path: '/auth', headers: {} }))
      .resolves.toEqual({ allowed: true, remaining: 1 });
    await expect(limiter.check(descriptor, context, { method: 'POST', path: '/auth', headers: {} }))
      .resolves.toEqual({ allowed: true, remaining: 0 });

    const blocked = await limiter.check(descriptor, context, {
      method: 'POST',
      path: '/auth',
      headers: {},
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    const telemetry = new NoopTelemetry();
    await telemetry.record('test.event', { ok: true, appId: 'app' });
    expect(await telemetry.flush()).toEqual([
      {
        event: 'test.event',
        fields: { ok: true, appId: 'app' },
      },
    ]);

    const executor = new StubProviderExecutor();
    const nonStreaming = await executor.execute({
      provider: 'openai',
      model: 'gpt-4o-mini',
      prompt: 'hello',
      stream: false,
      maxOutputTokens: 32,
      context,
    });
    expect(nonStreaming.output).toContain('stub:openai:gpt-4o-mini:32:hello');
    expect(nonStreaming.usage?.totalTokens).toBeTypeOf('number');
    expect(nonStreaming.stream).toBeUndefined();

    const streaming = await executor.execute({
      provider: 'openai',
      model: 'gpt-4o-mini',
      prompt: 'hello',
      stream: true,
      maxOutputTokens: 32,
      context,
    });
    const chunks: Array<{ event?: string; data: string }> = [];
    for await (const chunk of streaming.stream ?? []) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([
      {
        event: 'message',
        data: 'stub:openai:gpt-4o-mini:32:hello',
      },
    ]);
  });

  it('executes hosted requests through the initial provider adapter with usage metadata', async () => {
    const executor = new OpenAiProviderExecutor();

    const result = await executor.execute({
      provider: 'openai',
      model: 'gpt-4o-mini',
      prompt: 'hello',
      stream: false,
      maxOutputTokens: 128,
      context: {},
    });

    expect(result.output).toContain('openai:gpt-4o-mini:128:hello');
    expect(result.usage?.totalTokens).toBeTypeOf('number');
  });

  it('supports incremental provider streaming passthrough', async () => {
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      }),
      providerExecutor: new OpenAiProviderExecutor(),
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
    const reader = streamResponse.body?.getReader();
    if (!reader) {
      throw new Error('expected readable stream body');
    }

    const chunks: string[] = [];
    const decoder = new TextDecoder();
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      chunks.push(decoder.decode(next.value));
    }

    expect(chunks.join('')).toContain('data: openai:gpt-4');
    expect(chunks.join('')).toContain('data: o-mini:2048:');
    expect(chunks.join('')).toContain('data: hello');
  });

  it('translates provider adapter failures into safe upstream errors', async () => {
    const executor = new OpenAiProviderExecutor();

    await expect(
      executor.execute({
        provider: 'anthropic',
        model: 'claude',
        prompt: 'hello',
        stream: false,
        maxOutputTokens: 128,
        context: {},
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_MISMATCH',
    });
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

  it('loads production configuration with trimmed provider credentials and adapter values', () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'production',
      AI_GATEWAY_SIGNING_SECRET: '  prod-secret  ',
      OPENAI_API_KEY: '  openai-key  ',
      OPENAI_BASE_URL: '  https://example.test/v1  ',
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

  it('reads array headers, forwarded-for chains, and generated runtime metadata', () => {
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/auth',
        headers: {
          'user-agent': ['vitest-agent', 'ignored-agent'],
          'x-forwarded-for': ' 203.0.113.10, 198.51.100.5 ',
          'x-request-id': 'req-custom',
          'x-region': 'us-west-2',
          traceparent: '00-abc-123-01',
        },
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
        remoteAddress: '127.0.0.1',
      },
      loadGatewayConfig({ NODE_ENV: 'test' }),
      { appId: ' app ', clientId: ' client ' },
    );

    expect(context.identity).toEqual({ appId: 'app', clientId: 'client' });
    expect(context.network.userAgent).toBe('vitest-agent');
    expect(context.network.forwardedFor).toEqual(['203.0.113.10', '198.51.100.5']);
    expect(context.runtime.requestId).toBe('req-custom');
    expect(context.runtime.region).toBe('us-west-2');
    expect(context.tracing.traceId).toBe('00-abc-123-01');
  });

  it('omits empty forwarded-for values and rejects missing identity context', () => {
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/auth',
        headers: {
          'x-forwarded-for': ' , , ',
        },
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
      },
      loadGatewayConfig({ NODE_ENV: 'test' }),
      { appId: 'app', clientId: 'client' },
    );

    expect(context.network.forwardedFor).toEqual([]);

    expect(() =>
      createRequestContext(
        {
          method: 'POST',
          path: '/auth',
          headers: {},
          body: '{}',
        },
        loadGatewayConfig({ NODE_ENV: 'test' }),
        { appId: ' ', clientId: 'client' },
      ),
    ).toThrowError(/appId and clientId are required/);

    expect(() =>
      createRequestContext(
        {
          method: 'POST',
          path: '/auth',
          headers: {},
          body: '{}',
        },
        loadGatewayConfig({ NODE_ENV: 'test' }),
        undefined,
      ),
    ).toThrowError(/appId and clientId are required/);
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

  it('converts unknown errors into internal gateway errors and hides unsafe messages', () => {
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/ai',
        headers: {},
        body: JSON.stringify({ input: 'hello' }),
      },
      loadGatewayConfig({ NODE_ENV: 'test' }),
      { appId: 'app', clientId: 'client' },
    );

    const cause = new Error('boom');
    const gatewayError = toGatewayError(cause);
    const normalized = normalizeErrorResponse(cause, context);

    expect(gatewayError).toBeInstanceOf(GatewayError);
    expect(gatewayError.code).toBe('INTERNAL_ERROR');
    expect(gatewayError.cause).toBe(cause);
    expect(normalized.status).toBe(500);
    expect(normalized.body.error.code).toBe('INTERNAL_ERROR');
    expect(normalized.body.error.message).toBe('Internal server error');
  });

  it('returns gateway errors unchanged when normalizing unknown inputs', () => {
    const gatewayError = validationError('already normalized', 'ALREADY_NORMALIZED');

    expect(toGatewayError(gatewayError)).toBe(gatewayError);
  });

  it('writes logger output to the appropriate console methods for each level', () => {
    const output = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const logger = createLogger(output);

    logger.debug('debug message', { traceId: 't1' });
    logger.info('info message');
    logger.warn('warn message', { code: 'WARN' });
    logger.error('error message', { code: 'ERR' });

    expect(output.log).toHaveBeenCalledTimes(2);
    expect(output.warn).toHaveBeenCalledTimes(1);
    expect(output.error).toHaveBeenCalledTimes(1);
    expect(output.log).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ level: 'debug', message: 'debug message', fields: { traceId: 't1' } }),
    );
    expect(output.log).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({ level: 'info', message: 'info message', fields: undefined }),
    );
    expect(output.warn).toHaveBeenCalledWith(
      JSON.stringify({ level: 'warn', message: 'warn message', fields: { code: 'WARN' } }),
    );
    expect(output.error).toHaveBeenCalledWith(
      JSON.stringify({ level: 'error', message: 'error message', fields: { code: 'ERR' } }),
    );
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
    expect(aiBody.output).toContain('openai:gpt-4o-mini:2048:hello');
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

  it('supports default-model execution when ai model is omitted', async () => {
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

    if (authResult.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const authBody = JSON.parse(authResult.response.body) as { token: string };
    const aiResult = await service.handle({
      method: 'POST',
      path: '/ai',
      headers: {
        authorization: `Bearer ${authBody.token}`,
      },
      body: JSON.stringify({ provider: 'openai', input: 'hello' }),
    });

    expect(aiResult.kind).toBe('response');
    if (aiResult.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const aiBody = JSON.parse(aiResult.response.body) as { model: string };
    expect(aiBody.model).toBe('gpt-4o-mini');
  });

  it('rejects missing bearer token before provider execution', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      }),
    });

    const result = await service.handle({
      method: 'POST',
      path: '/ai',
      headers: {},
      body: JSON.stringify({ provider: 'openai', model: 'gpt-4o-mini', input: 'hello' }),
    });

    expect(result.kind).toBe('response');
    if (result.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const body = JSON.parse(result.response.body) as { error: { code: string } };
    expect(result.response.status).toBe(401);
    expect(body.error.code).toBe('MISSING_BEARER_TOKEN');
  });

  it('rejects expired bearer tokens before provider execution', async () => {
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
    const service = createGatewayService({ config });

    const result = await service.handle({
      method: 'POST',
      path: '/ai',
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ provider: 'openai', model: 'gpt-4o-mini', input: 'hello' }),
    });

    expect(result.kind).toBe('response');
    if (result.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const body = JSON.parse(result.response.body) as { error: { code: string } };
    expect(result.response.status).toBe(401);
    expect(body.error.code).toBe('INVALID_BEARER_TOKEN');
  });

  it('rejects malformed ai requests through the public api surface', async () => {
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

    if (authResult.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const authBody = JSON.parse(authResult.response.body) as { token: string };
    const result = await service.handle({
      method: 'POST',
      path: '/ai',
      headers: {
        authorization: `Bearer ${authBody.token}`,
      },
      body: '{bad json',
    });

    expect(result.kind).toBe('response');
    if (result.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const body = JSON.parse(result.response.body) as { error: { code: string } };
    expect(result.response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_JSON_BODY');
  });

  it('rejects unsupported models through the integrated api surface', async () => {
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

    if (authResult.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const authBody = JSON.parse(authResult.response.body) as { token: string };
    const result = await service.handle({
      method: 'POST',
      path: '/ai',
      headers: {
        authorization: `Bearer ${authBody.token}`,
      },
      body: JSON.stringify({ provider: 'openai', model: 'gpt-4o', input: 'hello' }),
    });

    expect(result.kind).toBe('response');
    if (result.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const body = JSON.parse(result.response.body) as { error: { code: string } };
    expect(result.response.status).toBe(403);
    expect(body.error.code).toBe('UNSUPPORTED_MODEL');
  });

  it('does not invoke provider execution when auth fails', async () => {
    let called = false;
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      }),
      providerExecutor: {
        async execute() {
          called = true;
          return { output: 'should-not-run' };
        },
      },
    });

    const result = await service.handle({
      method: 'POST',
      path: '/ai',
      headers: {},
      body: JSON.stringify({ provider: 'openai', model: 'gpt-4o-mini', input: 'hello' }),
    });

    expect(result.kind).toBe('response');
    expect(called).toBe(false);
  });

  it('does not invoke provider execution when policy rejects the request', async () => {
    let called = false;
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      }),
      providerExecutor: {
        async execute() {
          called = true;
          return { output: 'should-not-run' };
        },
      },
    });

    const authResult = await service.handle({
      method: 'POST',
      path: '/auth',
      headers: {},
      body: JSON.stringify({ appId: 'app', clientId: 'client' }),
    });

    if (authResult.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const authBody = JSON.parse(authResult.response.body) as { token: string };
    const result = await service.handle({
      method: 'POST',
      path: '/ai',
      headers: {
        authorization: `Bearer ${authBody.token}`,
      },
      body: JSON.stringify({ provider: 'openai', model: 'gpt-4o', input: 'hello' }),
    });

    expect(result.kind).toBe('response');
    expect(called).toBe(false);
  });
});
