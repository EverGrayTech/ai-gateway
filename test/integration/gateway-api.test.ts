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

  it('handles auth and ai requests through the shared service pipeline', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        OPENAI_API_KEY: 'openai-key',
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

  it('supports streaming-capable responses through the serverless adapter', async () => {
    const encoder = new TextEncoder();
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        OPENAI_API_KEY: 'openai-key',
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

  it('supports default-model execution when ai model is omitted', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        OPENAI_API_KEY: 'openai-key',
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

  it('handles anthropic ai requests through the shared service pipeline when configured', async () => {
    const service = createGatewayService({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        ANTHROPIC_API_KEY: 'anthropic-key',
        AI_GATEWAY_DEFAULT_PROVIDER: 'anthropic',
        AI_GATEWAY_DEFAULT_MODEL: 'claude-3-5-haiku-latest',
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
    expect(aiBody.output).toContain('anthropic:claude-3-5-haiku-latest:2048:hi');
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
    expect(aiBody.output).toContain('gemini:gemini-2.0-flash:2048:hi');
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
    expect(aiBody.output).toContain('openrouter:openai/gpt-4o-mini:2048:hi');
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

  it('supports incremental provider streaming passthrough', async () => {
    const encoder = new TextEncoder();
    const handler = createServerlessHandler({
      config: loadGatewayConfig({
        NODE_ENV: 'test',
        AI_GATEWAY_SIGNING_SECRET: 'test-secret',
        OPENAI_API_KEY: 'openai-key',
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
});
