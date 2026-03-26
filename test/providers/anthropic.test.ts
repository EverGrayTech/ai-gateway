import { describe, expect, it } from 'vitest';
import type { RequestContext } from '../../src/index.js';
import { AnthropicProviderExecutor } from '../../src/index.js';

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

describe('providers anthropic', () => {
  it('executes hosted requests through the real anthropic messages api with usage metadata', async () => {
    const executor = new AnthropicProviderExecutor({
      credentials: { apiKey: 'anthropic-key' },
      fetchFn: async (input, init) => {
        expect(String(input)).toBe('https://api.anthropic.com/v1/messages');
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          'x-api-key': 'anthropic-key',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          model: 'claude-3-5-haiku-latest',
          max_tokens: 128,
          messages: [{ role: 'user', content: 'hello' }],
        });

        return new Response(
          JSON.stringify({
            content: [{ type: 'text', text: 'hello from anthropic' }],
            usage: {
              input_tokens: 4,
              output_tokens: 5,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const result = await executor.execute({
      provider: 'anthropic',
      model: 'claude-3-5-haiku-latest',
      prompt: 'hello',
      stream: false,
      maxOutputTokens: 128,
      context: createRequestContext(),
    });

    expect(result.output).toBe('hello from anthropic');
    expect(result.usage).toEqual({
      inputTokens: 4,
      outputTokens: 5,
      totalTokens: 9,
    });
  });

  it('translates provider adapter failures into safe upstream errors', async () => {
    const executor = new AnthropicProviderExecutor();

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

  it('fails safely when anthropic credentials are not configured', async () => {
    const executor = new AnthropicProviderExecutor();

    await expect(
      executor.execute({
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        prompt: 'hello',
        stream: false,
        maxOutputTokens: 128,
        context: createRequestContext(),
      }),
    ).rejects.toMatchObject({
      code: 'ANTHROPIC_MISSING_CREDENTIALS',
    });
  });

  it('forwards anthropic streaming deltas through the normalized stream contract', async () => {
    const encoder = new TextEncoder();
    const executor = new AnthropicProviderExecutor({
      credentials: { apiKey: 'anthropic-key' },
      fetchFn: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"hello "}}\n\n',
                ),
              );
              controller.enqueue(
                encoder.encode(
                  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"anthropic"}}\n\n',
                ),
              );
              controller.close();
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    });

    const result = await executor.execute({
      provider: 'anthropic',
      model: 'claude-3-5-haiku-latest',
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
    expect(chunks).toEqual(['hello ', 'anthropic']);
  });

  it('translates anthropic http failures into safe gateway upstream errors', async () => {
    const executor = new AnthropicProviderExecutor({
      credentials: { apiKey: 'anthropic-key' },
      fetchFn: async () =>
        new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    });

    await expect(
      executor.execute({
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        prompt: 'hello',
        stream: false,
        maxOutputTokens: 128,
        context: createRequestContext(),
      }),
    ).rejects.toMatchObject({
      code: 'ANTHROPIC_RATE_LIMIT',
    });
  });
});
