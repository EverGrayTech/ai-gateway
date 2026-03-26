import { describe, expect, it } from 'vitest';
import { GeminiProviderExecutor } from '../../src/index.js';

describe('providers gemini', () => {
  it('executes hosted requests through the gemini provider adapter with usage metadata', async () => {
    const executor = new GeminiProviderExecutor();

    const result = await executor.execute({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      prompt: 'hello',
      stream: false,
      maxOutputTokens: 128,
      context: {},
    });

    expect(result.output).toContain('gemini:gemini-2.0-flash:128:hello');
    expect(result.usage?.totalTokens).toBeTypeOf('number');
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
        context: {},
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_MISMATCH',
    });
  });
});
