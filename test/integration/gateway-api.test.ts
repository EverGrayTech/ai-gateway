import { describe, expect, it } from 'vitest';
import {
  AnthropicProviderExecutor,
  GeminiProviderExecutor,
  HmacTokenSigner,
  NoopRateLimiter,
  NoopTelemetry,
  OpenAiProviderExecutor,
  OpenRouterProviderExecutor,
  StubProviderExecutor,
  type TelemetryRecord,
  createGatewayService,
  createLogger,
  createServerlessHandler,
  createTokenClaims,
  loadGatewayConfig,
} from '../../src/index.js';

describe('integration gateway api', () => {
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

    for (let i = 0; i < 5; i += 1) {
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

  it('wires external rate limiting through the gateway service without changing auth contract', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        AI_GATEWAY_RATE_LIMITER: 'external',
      }),
      providerExecutor: new StubProviderExecutor(),
    });

    const first = await service.handle({
      method: 'POST',
      path: '/auth',
      headers: {},
      body: JSON.stringify({ appId: 'app', clientId: 'client' }),
      remoteAddress: '127.0.0.1',
    });

    expect(first.kind).toBe('response');
    if (first.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const body = JSON.parse(first.response.body) as {
      token: string;
      issuedAt: string;
      expiresAt: string;
    };
    expect(body.token).toBeTruthy();
    expect(body.issuedAt).toBeTruthy();
    expect(body.expiresAt).toBeTruthy();
  });

  it('handles auth and ai requests through the shared service pipeline', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        OPENAI_API_KEY: 'openai-key',
        AI_GATEWAY_DEFAULT_PROVIDER: 'openai',
        AI_GATEWAY_DEFAULT_MODEL: 'gpt-4o-mini',
      }),
      providerExecutor: new OpenAiProviderExecutor({
        credentials: { apiKey: 'openai-key' },
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              output: [{ content: [{ type: 'output_text', text: 'hello from openai' }] }],
              usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
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

    const aiBody = JSON.parse(aiResult.response.body) as {
      output: string;
      usage: { totalTokens: number };
    };
    expect(aiBody.output).toBe('hello from openai');
    expect(aiBody.usage.totalTokens).toBe(5);
  });

  it('normalizes auth identifiers before token issuance and downstream verification', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        OPENAI_API_KEY: 'openai-key',
        AI_GATEWAY_DEFAULT_PROVIDER: 'openai',
        AI_GATEWAY_DEFAULT_MODEL: 'gpt-4o-mini',
      }),
      providerExecutor: new StubProviderExecutor(),
    });

    const authResult = await service.handle({
      method: 'POST',
      path: '/auth',
      headers: {},
      body: JSON.stringify({ appId: ' My-App ', clientId: ' Client_01 ' }),
      remoteAddress: '127.0.0.1',
    });

    expect(authResult.kind).toBe('response');
    if (authResult.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const authBody = JSON.parse(authResult.response.body) as { token: string };
    const signer = new HmacTokenSigner('test-secret');
    const verified = await signer.verify(authBody.token);

    expect(verified.claims.appId).toBe('my-app');
    expect(verified.claims.clientId).toBe('client_01');
  });

  it('rejects malformed auth identifiers before issuance', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        AI_GATEWAY_DEFAULT_PROVIDER: 'openai',
        AI_GATEWAY_DEFAULT_MODEL: 'gpt-4o-mini',
      }),
    });

    const result = await service.handle({
      method: 'POST',
      path: '/auth',
      headers: {},
      body: JSON.stringify({ appId: 'bad value!', clientId: 'client' }),
      remoteAddress: '127.0.0.1',
    });

    expect(result.kind).toBe('response');
    if (result.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const body = JSON.parse(result.response.body) as {
      ok: false;
      code: string;
      category: string;
      status: number;
      retryable: boolean;
      details?: Record<string, unknown>;
    };
    expect(result.response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('auth-invalid-app-id');
    expect(body.category).toBe('validation');
    expect(body.status).toBe(400);
    expect(body.retryable).toBe(false);
    expect(body.details).toMatchObject({ field: 'appId', reason: 'invalid_format' });
  });

  it('supports streaming-capable responses through the serverless adapter', async () => {
    const encoder = new TextEncoder();
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        OPENAI_API_KEY: 'openai-key',
        AI_GATEWAY_DEFAULT_PROVIDER: 'openai',
        AI_GATEWAY_DEFAULT_MODEL: 'gpt-4o-mini',
      }),
      providerExecutor: new OpenAiProviderExecutor({
        credentials: { apiKey: 'openai-key' },
        fetchFn: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  encoder.encode('data: {"type":"response.output_text.delta","delta":"hello"}\n\n'),
                );
                controller.enqueue(
                  encoder.encode(
                    'data: {"type":"response.output_text.delta","delta":" world"}\n\n',
                  ),
                );
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
              },
            }),
            { status: 200, headers: { 'content-type': 'text/event-stream' } },
          ),
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

  it('applies default cors headers for allowed localhost origins through the serverless adapter', async () => {
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      }),
    });

    const response = await handler({
      method: 'POST',
      url: 'https://example.test/auth',
      headers: new Headers({ origin: 'http://localhost:5173', 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ appId: 'app', clientId: 'client' }),
    });

    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe('content-type, authorization');
    expect(response.headers.get('vary')).toBe('Origin');
  });

  it('reflects configured exact origins in cors responses', async () => {
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        AI_GATEWAY_ALLOWED_ORIGINS: 'https://app.evergraytech.com',
      }),
    });

    const response = await handler({
      method: 'POST',
      url: 'https://example.test/auth',
      headers: new Headers({ origin: 'https://app.evergraytech.com', 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ appId: 'app', clientId: 'client' }),
    });

    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.evergraytech.com');
  });

  it('supports wildcard subdomain cors matches without returning wildcard headers', async () => {
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        AI_GATEWAY_ALLOWED_ORIGINS: 'https://*.evergraytech.com',
      }),
    });

    const response = await handler({
      method: 'POST',
      url: 'https://example.test/auth',
      headers: new Headers({ origin: 'https://dev.evergraytech.com', 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ appId: 'app', clientId: 'client' }),
    });

    expect(response.headers.get('access-control-allow-origin')).toBe('https://dev.evergraytech.com');
  });

  it('omits access-control-allow-origin for disallowed origins', async () => {
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        AI_GATEWAY_ALLOWED_ORIGINS: 'https://*.evergraytech.com',
      }),
    });

    const response = await handler({
      method: 'POST',
      url: 'https://example.test/auth',
      headers: new Headers({ origin: 'https://example.com', 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ appId: 'app', clientId: 'client' }),
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('vary')).toBe('Origin');
  });

  it('handles options preflight without invoking gateway logic', async () => {
    let called = false;
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        AI_GATEWAY_ALLOWED_ORIGINS: 'https://*.evergraytech.com',
      }),
      providerExecutor: {
        async execute() {
          called = true;
          return { output: 'should-not-run' };
        },
      },
    });

    const response = await handler({
      method: 'OPTIONS',
      url: 'https://example.test/ai',
      headers: new Headers({ origin: 'https://dev.evergraytech.com' }),
      text: async () => '',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://dev.evergraytech.com');
    expect(called).toBe(false);
  });

  it('applies cors headers to handled error responses', async () => {
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        AI_GATEWAY_ALLOWED_ORIGINS: 'https://app.evergraytech.com',
      }),
    });

    const response = await handler({
      method: 'POST',
      url: 'https://example.test/ai',
      headers: new Headers({ origin: 'https://app.evergraytech.com' }),
      text: async () => JSON.stringify({ provider: 'openai', model: 'gpt-4o-mini', input: 'hello' }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.evergraytech.com');
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe('content-type, authorization');
    expect(response.headers.get('vary')).toBe('Origin');
  });

  it('supports default-model execution when ai model is omitted', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        OPENAI_API_KEY: 'openai-key',
        AI_GATEWAY_DEFAULT_PROVIDER: 'openai',
        AI_GATEWAY_DEFAULT_MODEL: 'gpt-4o-mini',
      }),
      providerExecutor: new OpenAiProviderExecutor({
        credentials: { apiKey: 'openai-key' },
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              output: [{ content: [{ type: 'output_text', text: 'default model output' }] }],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
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

  it('supports zero-setup hosted execution when provider and model are both omitted', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        OPENROUTER_API_KEY: 'openrouter-key',
      }),
      providerExecutor: new OpenRouterProviderExecutor({
        credentials: { apiKey: 'openrouter-key' },
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: 'zero setup hosted output' } }],
              usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
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
      body: JSON.stringify({ input: 'hello default hosted path' }),
    });

    expect(aiResult.kind).toBe('response');
    if (aiResult.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const aiBody = JSON.parse(aiResult.response.body) as {
      provider: string;
      model: string;
      output: string;
    };
    expect(aiBody.provider).toBe('openrouter');
    expect(aiBody.model).toBe('openai/gpt-4o-mini');
    expect(aiBody.output).toBe('zero setup hosted output');
  });

  it('rejects model selection when provider is omitted in hosted default mode', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        OPENROUTER_API_KEY: 'openrouter-key',
      }),
      providerExecutor: new OpenRouterProviderExecutor({
        credentials: { apiKey: 'openrouter-key' },
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
      body: JSON.stringify({ model: 'openai/gpt-4o', input: 'hello default hosted path' }),
    });

    expect(aiResult.kind).toBe('response');
    if (aiResult.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const body = JSON.parse(aiResult.response.body) as {
      ok: false;
      code: string;
      category: string;
      status: number;
      retryable: boolean;
      details?: Record<string, unknown>;
    };

    expect(aiResult.response.status).toBe(400);
    expect(body.code).toBe('request-invalid');
    expect(body.category).toBe('validation');
    expect(body.retryable).toBe(false);
    expect(body.details).toMatchObject({ field: 'model', reason: 'model_requires_provider' });
  });

  it('applies bounded hosted defaults for token constraints in zero-setup mode', async () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      AI_GATEWAY_MAX_INPUT_TOKENS: '1024',
      AI_GATEWAY_MAX_OUTPUT_TOKENS: '256',
      AI_GATEWAY_TOKEN_TTL_SECONDS: '120',
    });

    const claims = createTokenClaims({ appId: 'app', clientId: 'client' }, config, new Date());

    expect(claims.constraints.maxInputTokens).toBe(1024);
    expect(claims.constraints.maxOutputTokens).toBe(256);
    expect(claims.exp - claims.iat).toBe(120);
  });

  it('handles anthropic ai requests through the shared service pipeline when configured', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        ANTHROPIC_API_KEY: 'anthropic-key',
        AI_GATEWAY_DEFAULT_PROVIDER: 'anthropic',
        AI_GATEWAY_DEFAULT_MODEL: 'claude-3-5-haiku-latest',
      }),
      providerExecutor: new AnthropicProviderExecutor({
        credentials: { apiKey: 'anthropic-key' },
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              content: [{ type: 'text', text: 'hello from anthropic' }],
              usage: { input_tokens: 2, output_tokens: 4 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
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
      body: JSON.stringify({
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        input: 'hi',
      }),
    });

    expect(aiResult.kind).toBe('response');
    if (aiResult.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const aiBody = JSON.parse(aiResult.response.body) as { output: string; provider: string };
    expect(aiBody.provider).toBe('anthropic');
    expect(aiBody.output).toBe('hello from anthropic');
  });

  it('handles gemini ai requests through the shared service pipeline when configured', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        GEMINI_API_KEY: 'gemini-key',
        AI_GATEWAY_DEFAULT_PROVIDER: 'gemini',
        AI_GATEWAY_DEFAULT_MODEL: 'gemini-2.0-flash',
      }),
      providerExecutor: new GeminiProviderExecutor({
        credentials: { apiKey: 'gemini-key' },
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [{ text: 'hello from gemini' }],
                  },
                },
              ],
              usageMetadata: {
                promptTokenCount: 2,
                candidatesTokenCount: 3,
                totalTokenCount: 5,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
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
      body: JSON.stringify({ provider: 'gemini', model: 'gemini-2.0-flash', input: 'hi' }),
    });

    expect(aiResult.kind).toBe('response');
    if (aiResult.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const aiBody = JSON.parse(aiResult.response.body) as { output: string; provider: string };
    expect(aiBody.provider).toBe('gemini');
    expect(aiBody.output).toBe('hello from gemini');
  });

  it('handles openrouter ai requests through the shared service pipeline when configured', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        OPENROUTER_API_KEY: 'openrouter-key',
        AI_GATEWAY_DEFAULT_PROVIDER: 'openrouter',
        AI_GATEWAY_DEFAULT_MODEL: 'openai/gpt-4o-mini',
      }),
      providerExecutor: new OpenRouterProviderExecutor({
        credentials: { apiKey: 'openrouter-key' },
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: 'hello from openrouter' } }],
              usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
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
      body: JSON.stringify({ provider: 'openrouter', model: 'openai/gpt-4o-mini', input: 'hi' }),
    });

    expect(aiResult.kind).toBe('response');
    if (aiResult.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const aiBody = JSON.parse(aiResult.response.body) as { output: string; provider: string };
    expect(aiBody.provider).toBe('openrouter');
    expect(aiBody.output).toBe('hello from openrouter');
  });

  it('rejects missing bearer token before provider execution', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        AI_GATEWAY_DEFAULT_PROVIDER: 'openai',
        AI_GATEWAY_DEFAULT_MODEL: 'gpt-4o-mini',
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

    const body = JSON.parse(result.response.body) as {
      ok: false;
      code: string;
      category: string;
      status: number;
      retryable: boolean;
      details?: Record<string, unknown>;
    };
    expect(result.response.status).toBe(401);
    expect(body.code).toBe('token-missing');
    expect(body.category).toBe('authentication');
    expect(body.status).toBe(401);
    expect(body.retryable).toBe(false);
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

    const body = JSON.parse(result.response.body) as {
      ok: false;
      code: string;
      category: string;
      status: number;
      retryable: boolean;
      details?: Record<string, unknown>;
    };
    expect(result.response.status).toBe(401);
    expect(body.code).toBe('token-invalid');
    expect(body.category).toBe('authentication');
    expect(body.status).toBe(401);
    expect(body.retryable).toBe(false);
  });

  it('rejects malformed ai requests through the public api surface', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        AI_GATEWAY_DEFAULT_PROVIDER: 'openai',
        AI_GATEWAY_DEFAULT_MODEL: 'gpt-4o-mini',
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

    const body = JSON.parse(result.response.body) as {
      ok: false;
      code: string;
      category: string;
      status: number;
      retryable: boolean;
      details?: Record<string, unknown>;
    };
    expect(result.response.status).toBe(400);
    expect(body.code).toBe('request-invalid');
    expect(body.category).toBe('validation');
    expect(body.details).toMatchObject({ reason: 'invalid_json' });
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

    const body = JSON.parse(result.response.body) as {
      ok: false;
      code: string;
      category: string;
      status: number;
      retryable: boolean;
      details?: Record<string, unknown>;
    };

    expect(body.code).toBe('policy-provider-not-allowed');
    expect(body.category).toBe('policy');
    expect(body.status).toBe(403);
    expect(body.retryable).toBe(false);
    expect(body.details).toMatchObject({ provider: 'openai' });
  });

  it('returns a consistent structured error envelope for auth validation failures', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      }),
    });

    const result = await service.handle({
      method: 'POST',
      path: '/auth',
      headers: {},
      body: JSON.stringify({ appId: 'app' }),
    });

    if (result.kind !== 'response') {
      throw new Error('expected standard response');
    }

    const body = JSON.parse(result.response.body) as {
      ok: false;
      code: string;
      message: string;
      category: string;
      status: number;
      retryable: boolean;
      details?: Record<string, unknown>;
    };

    expect(result.response.status).toBe(400);
    expect(body).toMatchObject({
      ok: false,
      code: 'auth-invalid-client-id',
      category: 'validation',
      status: 400,
      retryable: false,
    });
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

  it('supports incremental provider streaming passthrough', async () => {
    const encoder = new TextEncoder();
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        OPENAI_API_KEY: 'openai-key',
        AI_GATEWAY_DEFAULT_PROVIDER: 'openai',
        AI_GATEWAY_DEFAULT_MODEL: 'gpt-4o-mini',
      }),
      providerExecutor: new OpenAiProviderExecutor({
        credentials: { apiKey: 'openai-key' },
        fetchFn: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  encoder.encode(
                    'data: {"type":"response.output_text.delta","delta":"hello "}\n\n',
                  ),
                );
                controller.enqueue(
                  encoder.encode(
                    'data: {"type":"response.output_text.delta","delta":"stream"}\n\n',
                  ),
                );
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
              },
            }),
            { status: 200, headers: { 'content-type': 'text/event-stream' } },
          ),
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

    expect(chunks.join('')).toContain('data: hello ');
    expect(chunks.join('')).toContain('data: stream');
  });

  it('formats streamed chunks as browser-compatible sse events in order', async () => {
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        AI_GATEWAY_DEFAULT_PROVIDER: 'openai',
        AI_GATEWAY_DEFAULT_MODEL: 'gpt-4o-mini',
      }),
      providerExecutor: {
        async execute() {
          return {
            output: '',
            stream: (async function* () {
              yield { event: 'message', data: 'first' };
              yield { data: 'second' };
            })(),
          };
        },
      },
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
      text: async () => JSON.stringify({ provider: 'openai', input: 'hello', stream: true }),
    });

    const reader = streamResponse.body?.getReader();
    if (!reader) {
      throw new Error('expected readable stream body');
    }

    const decoder = new TextDecoder();
    const payloads: string[] = [];
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }

      payloads.push(decoder.decode(next.value));
    }

    expect(payloads).toEqual(['event: message\ndata: first\n\n', 'data: second\n\n']);
  });

  it('propagates downstream stream cancellation to the provider iterator', async () => {
    let cancelled = false;
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        AI_GATEWAY_DEFAULT_PROVIDER: 'openai',
        AI_GATEWAY_DEFAULT_MODEL: 'gpt-4o-mini',
      }),
      providerExecutor: {
        async execute() {
          return {
            output: '',
            stream: {
              [Symbol.asyncIterator]() {
                return {
                  async next() {
                    return { done: false, value: { event: 'message', data: 'first' } };
                  },
                  async return() {
                    cancelled = true;
                    return { done: true, value: undefined };
                  },
                };
              },
            },
          };
        },
      },
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
      text: async () => JSON.stringify({ provider: 'openai', input: 'hello', stream: true }),
    });

    const reader = streamResponse.body?.getReader();
    if (!reader) {
      throw new Error('expected readable stream body');
    }

    await reader.read();
    await reader.cancel();

    expect(cancelled).toBe(true);
  });

  it('surfaces mid-stream provider failures as terminated stream reads', async () => {
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        AI_GATEWAY_DEFAULT_PROVIDER: 'openai',
        AI_GATEWAY_DEFAULT_MODEL: 'gpt-4o-mini',
      }),
      providerExecutor: {
        async execute() {
          return {
            output: '',
            stream: (async function* () {
              yield { event: 'message', data: 'partial' };
              throw new Error('stream exploded');
            })(),
          };
        },
      },
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
      text: async () => JSON.stringify({ provider: 'openai', input: 'hello', stream: true }),
    });

    const reader = streamResponse.body?.getReader();
    if (!reader) {
      throw new Error('expected readable stream body');
    }

    const firstChunk = await reader.read();
    expect(new TextDecoder().decode(firstChunk.value)).toContain('data: partial');
    await expect(reader.read()).rejects.toThrow('stream exploded');
  });

  it('normalizes node-like headers and relative urls through the serverless adapter', async () => {
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      }),
    });

    const authResponse = await handler({
      method: 'POST',
      url: '/auth?via=node',
      headers: {
        host: 'gateway.test',
        'x-forwarded-proto': 'http',
        'x-forwarded-host': 'forwarded.gateway.test',
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
      },
      body: JSON.stringify({ appId: 'app', clientId: 'client' }),
    });

    expect(authResponse.status).toBe(200);
    expect(authResponse.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const authBody = (await authResponse.json()) as { token: string };
    expect(authBody.token).toBeTruthy();
  });

  it('supports absolute node-like urls without host headers', async () => {
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      }),
    });

    const response = await handler({
      method: 'POST',
      url: 'https://absolute.example/auth?src=absolute',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ appId: 'app', clientId: 'client' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string };
    expect(body.token).toBeTruthy();
  });

  it('rejects malformed origin patterns and invalid origin/header combinations safely', async () => {
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        AI_GATEWAY_ALLOWED_ORIGINS: 'notaurl, https://*.evergraytech.com',
      }),
    });

    const invalidOriginResponse = await handler({
      method: 'POST',
      url: 'https://example.test/auth',
      headers: new Headers({ origin: '%%%not-an-origin%%%', 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ appId: 'app', clientId: 'client' }),
    });

    expect(invalidOriginResponse.headers.get('access-control-allow-origin')).toBeNull();

    const wildcardMissResponse = await handler({
      method: 'POST',
      url: 'https://example.test/auth',
      headers: new Headers({ origin: 'http://dev.evergraytech.com', 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ appId: 'app', clientId: 'client' }),
    });

    expect(wildcardMissResponse.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('sets content-length on handled responses even when the body is a structured error', async () => {
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      }),
      providerExecutor: {
        async execute() {
          return { output: 'unused' };
        },
      },
    });

    const response = await handler({
      method: 'GET',
      url: 'https://example.test/unknown-route',
      headers: new Headers(),
      text: async () => '',
    });

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('content-length')).toBeTruthy();
  });

  it('throws for relative node-like urls without host information', async () => {
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
      }),
    });

    await expect(
      handler({
        method: 'POST',
        url: '/auth',
        headers: {},
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
      }),
    ).rejects.toThrow('Invalid URL: /auth');
  });
});
