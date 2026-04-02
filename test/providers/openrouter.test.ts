import { describe, expect, it } from 'vitest';
import type { RequestContext } from '../../src/index.js';
import { OpenRouterProviderExecutor } from '../../src/index.js';

const createRequestContext = (): RequestContext => ({
  identity: {
    appId: 'app',
    clientId: 'client',
  },
  network: {},
  runtime: {
    requestId: 'request-id',
    receivedAt: new Date(0).toISOString(),
    environment: 'test',
  },
  tracing: {
    correlationId: 'correlation-id',
  },
});

describe('providers openrouter', () => {
  it('executes hosted requests through the real openrouter api with usage metadata', async () => {
    const executor = new OpenRouterProviderExecutor({
      credentials: { apiKey: 'openrouter-key' },
      fetchFn: async (input, init) => {
        expect(String(input)).toBe('https://openrouter.ai/api/v1/chat/completions');
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer openrouter-key',
          'content-type': 'application/json',
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          model: 'openai/gpt-4o-mini',
          messages: [{ role: 'user', content: 'hello' }],
          max_tokens: 128,
        });

        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'hello from openrouter' } }],
            usage: {
              prompt_tokens: 3,
              completion_tokens: 4,
              total_tokens: 7,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const result = await executor.execute({
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      prompt: 'hello',
      stream: false,
      maxOutputTokens: 128,
      context: createRequestContext(),
    });

    expect(result.output).toBe('hello from openrouter');
    expect(result.usage).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
    });
  });

  it('translates provider adapter failures into safe upstream errors', async () => {
    const executor = new OpenRouterProviderExecutor();

    await expect(
      executor.execute({
        provider: 'openai',
        model: 'gpt-4o-mini',
        prompt: 'hello',
        stream: false,
        maxOutputTokens: 128,
        context: createRequestContext(),
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_MISMATCH',
    });
  });

  it('fails safely when openrouter credentials are not configured', async () => {
    const executor = new OpenRouterProviderExecutor();

    await expect(
      executor.execute({
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        prompt: 'hello',
        stream: false,
        maxOutputTokens: 128,
        context: createRequestContext(),
      }),
    ).rejects.toMatchObject({
      code: 'OPENROUTER_MISSING_CREDENTIALS',
    });
  });

  it('forwards openrouter streaming deltas through the normalized stream contract', async () => {
    const encoder = new TextEncoder();
    const executor = new OpenRouterProviderExecutor({
      credentials: { apiKey: 'openrouter-key' },
      fetchFn: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode('data: {"choices":[{"delta":{"content":"hello "}}]}\n\n'),
              );
              controller.enqueue(
                encoder.encode('data: {"choices":[{"delta":{"content":"openrouter"}}]}\n\n'),
              );
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    });

    const result = await executor.execute({
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      prompt: 'hello',
      stream: true,
      maxOutputTokens: 128,
      context: createRequestContext(),
    });

    const chunks: string[] = [];
    for await (const chunk of result.stream ?? []) {
      chunks.push(chunk.data);
    }

    expect(result.output).toBe('');
    expect(chunks).toEqual(['hello ', 'openrouter']);
  });

  it('translates openrouter http failures into safe gateway upstream errors', async () => {
    const executor = new OpenRouterProviderExecutor({
      credentials: { apiKey: 'openrouter-key' },
      fetchFn: async () =>
        new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    });

    await expect(
      executor.execute({
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        prompt: 'hello',
        stream: false,
        maxOutputTokens: 128,
        context: createRequestContext(),
      }),
    ).rejects.toMatchObject({
      code: 'OPENROUTER_RATE_LIMIT',
    });
  });

  it('prefers request-scoped credentials over configured credentials for BYOK execution', async () => {
    const executor = new OpenRouterProviderExecutor({
      credentials: { apiKey: 'configured-key' },
      fetchFn: async (_input, init) => {
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer byok-key',
        });

        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'hello byok openrouter' } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const result = await executor.execute({
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      prompt: 'hello',
      stream: false,
      maxOutputTokens: 128,
      context: createRequestContext(),
      credentialsOverride: { apiKey: 'byok-key' },
    });

    expect(result.output).toBe('hello byok openrouter');
  });
});
