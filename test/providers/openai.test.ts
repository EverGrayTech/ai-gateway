import { describe, expect, it } from 'vitest';
import { OpenAiProviderExecutor } from '../../src/index.js';

describe('providers openai', () => {
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
});
