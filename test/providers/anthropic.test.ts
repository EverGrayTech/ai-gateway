import { describe, expect, it } from 'vitest';
import { AnthropicProviderExecutor } from '../../src/index.js';

describe('providers anthropic', () => {
  it('executes hosted requests through the anthropic provider adapter with usage metadata', async () => {
    const executor = new AnthropicProviderExecutor();

    const result = await executor.execute({
      provider: 'anthropic',
      model: 'claude-3-5-haiku-latest',
      prompt: 'hello',
      stream: false,
      maxOutputTokens: 128,
      context: {},
    });

    expect(result.output).toContain('anthropic:claude-3-5-haiku-latest:128:hello');
    expect(result.usage?.totalTokens).toBeTypeOf('number');
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
        context: {},
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_MISMATCH',
    });
  });
});
