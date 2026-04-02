import { describe, expect, it } from 'vitest';
import type { RequestContext } from '../../src/index.js';
import { GeminiProviderExecutor } from '../../src/index.js';

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

describe('providers gemini', () => {
  it('executes hosted requests through the real gemini api with usage metadata', async () => {
    const executor = new GeminiProviderExecutor({
      credentials: { apiKey: 'gemini-key' },
      fetchFn: async (input, init) => {
        expect(String(input)).toBe(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        );
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          'x-goog-api-key': 'gemini-key',
          'content-type': 'application/json',
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          contents: [
            {
              role: 'user',
              parts: [{ text: 'hello' }],
            },
          ],
          generationConfig: { maxOutputTokens: 128 },
        });

        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: 'hello from gemini' }],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 3,
              candidatesTokenCount: 4,
              totalTokenCount: 7,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const result = await executor.execute({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      prompt: 'hello',
      stream: false,
      maxOutputTokens: 128,
      context: createRequestContext(),
    });

    expect(result.output).toBe('hello from gemini');
    expect(result.usage).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
    });
  });

  it('translates provider adapter failures into safe upstream errors', async () => {
    const executor = new GeminiProviderExecutor();

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

  it('fails safely when gemini credentials are not configured', async () => {
    const executor = new GeminiProviderExecutor();

    await expect(
      executor.execute({
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        prompt: 'hello',
        stream: false,
        maxOutputTokens: 128,
        context: createRequestContext(),
      }),
    ).rejects.toMatchObject({
      code: 'GEMINI_MISSING_CREDENTIALS',
    });
  });

  it('forwards gemini streaming chunks through the normalized stream contract', async () => {
    const executor = new GeminiProviderExecutor({
      credentials: { apiKey: 'gemini-key' },
      fetchFn: async (input) => {
        expect(String(input)).toBe(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse',
        );

        return new Response(
          JSON.stringify([
            { candidates: [{ content: { parts: [{ text: 'hello ' }] } }] },
            { candidates: [{ content: { parts: [{ text: 'gemini' }] } }] },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const result = await executor.execute({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
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
    expect(chunks).toEqual(['hello ', 'gemini']);
  });

  it('translates gemini http failures into safe gateway upstream errors', async () => {
    const executor = new GeminiProviderExecutor({
      credentials: { apiKey: 'gemini-key' },
      fetchFn: async () =>
        new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    });

    await expect(
      executor.execute({
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        prompt: 'hello',
        stream: false,
        maxOutputTokens: 128,
        context: createRequestContext(),
      }),
    ).rejects.toMatchObject({
      code: 'GEMINI_RATE_LIMIT',
    });
  });

  it('prefers request-scoped credentials over configured credentials for BYOK execution', async () => {
    const executor = new GeminiProviderExecutor({
      credentials: { apiKey: 'configured-key' },
      fetchFn: async (_input, init) => {
        expect(init?.headers).toMatchObject({
          'x-goog-api-key': 'byok-key',
        });

        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'hello byok gemini' }] } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const result = await executor.execute({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      prompt: 'hello',
      stream: false,
      maxOutputTokens: 128,
      context: createRequestContext(),
      credentialsOverride: { apiKey: 'byok-key' },
    });

    expect(result.output).toBe('hello byok gemini');
  });
});
