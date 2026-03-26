import { describe, expect, it } from 'vitest';
import { StubProviderExecutor, createRequestContext, loadGatewayConfig } from '../../src/index.js';

describe('runtime adapters', () => {
  it('exposes provider stub data for non-streaming and streaming execution', async () => {
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
});
