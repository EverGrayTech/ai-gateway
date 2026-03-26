import { describe, expect, it } from 'vitest';
import { OpenRouterProviderExecutor } from '../../src/index.js';

describe('providers openrouter', () => {
  it('executes hosted requests through the openrouter provider adapter with usage metadata', async () => {
    const executor = new OpenRouterProviderExecutor();

    const result = await executor.execute({
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      prompt: 'hello',
      stream: false,
      maxOutputTokens: 128,
      context: {},
    });

    expect(result.output).toContain('openrouter:openai/gpt-4o-mini:128:hello');
    expect(result.usage?.totalTokens).toBeTypeOf('number');
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
        context: {},
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_MISMATCH',
    });
  });
});
