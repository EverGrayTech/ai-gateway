import { describe, expect, it } from 'vitest';
import type { RequestContext } from '../../src/index.js';
import { OpenAiProviderExecutor } from '../../src/index.js';

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

describe('providers openai', () => {
  it('executes hosted requests through the real responses api mapping with usage metadata', async () => {
    const executor = new OpenAiProviderExecutor({
      credentials: { apiKey: 'test-key' },
      fetchFn: async (input, init) => {
        expect(String(input)).toBe('https://api.openai.com/v1/responses');
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer test-key',
          'content-type': 'application/json',
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          model: 'gpt-4o-mini',
          input: [
            {
              role: 'user',
              content: [{ type: 'input_text', text: 'hello' }],
            },
          ],
          max_output_tokens: 128,
        });

        return new Response(
          JSON.stringify({
            output: [
              {
                content: [
                  { type: 'output_text', text: 'hello ' },
                  { type: 'output_text', text: 'world' },
                ],
              },
            ],
            usage: {
              input_tokens: 3,
              output_tokens: 2,
              total_tokens: 5,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const result = await executor.execute({
      provider: 'openai',
      model: 'gpt-4o-mini',
      prompt: 'hello',
      stream: false,
      maxOutputTokens: 128,
      context: createRequestContext(),
    });

    expect(result.output).toBe('hello world');
    expect(result.usage).toEqual({
      inputTokens: 3,
      outputTokens: 2,
      totalTokens: 5,
    });
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
        context: createRequestContext(),
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_MISMATCH',
    });
  });

  it('fails safely when openai credentials are not configured', async () => {
    const executor = new OpenAiProviderExecutor();

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
      code: 'OPENAI_MISSING_CREDENTIALS',
    });
  });

  it('forwards upstream streaming deltas through the normalized stream contract', async () => {
    const encoder = new TextEncoder();
    const executor = new OpenAiProviderExecutor({
      credentials: { apiKey: 'test-key' },
      fetchFn: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hello "}\n\n',
                ),
              );
              controller.enqueue(
                encoder.encode(
                  'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"world"}\n\n',
                ),
              );
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    });

    const result = await executor.execute({
      provider: 'openai',
      model: 'gpt-4o-mini',
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
    expect(chunks).toEqual(['hello ', 'world']);
  });

  it('translates upstream http failures into safe gateway upstream errors', async () => {
    const executor = new OpenAiProviderExecutor({
      credentials: { apiKey: 'test-key' },
      fetchFn: async () =>
        new Response(JSON.stringify({ error: { message: 'too many requests' } }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    });

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
      code: 'OPENAI_RATE_LIMIT',
    });
  });

  it('prefers request-scoped credentials over configured credentials for BYOK execution', async () => {
    const executor = new OpenAiProviderExecutor({
      credentials: { apiKey: 'configured-key' },
      fetchFn: async (_input, init) => {
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer byok-key',
        });

        return new Response(
          JSON.stringify({
            output: [{ content: [{ type: 'output_text', text: 'hello byok' }] }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const result = await executor.execute({
      provider: 'openai',
      model: 'gpt-4o-mini',
      prompt: 'hello',
      stream: false,
      maxOutputTokens: 128,
      context: createRequestContext(),
      credentialsOverride: { apiKey: 'byok-key' },
    });

    expect(result.output).toBe('hello byok');
  });
});
