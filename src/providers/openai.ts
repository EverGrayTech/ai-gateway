import type { ProviderModelMetadata } from '../contracts/provider.js';
import { upstreamError } from '../errors/factories.js';
import type { ProviderExecutorPort } from '../runtime/ports.js';

const OPENAI_MODELS: readonly ProviderModelMetadata[] = [
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    supportsStreaming: true,
  },
];

const createUsage = (prompt: string, output: string) => {
  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = Math.ceil(output.length / 4);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
};

const createStream = async function* (
  output: string,
): AsyncIterable<{ event?: string; data: string }> {
  const segments = output.match(/.{1,12}/g) ?? [output];
  for (const segment of segments) {
    yield { event: 'message', data: segment };
  }
};

export class OpenAiProviderExecutor implements ProviderExecutorPort {
  public readonly metadata = OPENAI_MODELS;

  public async execute(input: {
    provider: string;
    model: string;
    prompt: string;
    stream: boolean;
    maxOutputTokens: number;
    context: unknown;
  }): Promise<{
    output: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    stream?: AsyncIterable<{ event?: string; data: string }>;
  }> {
    if (input.provider !== 'openai') {
      throw upstreamError(
        'Provider adapter does not support requested provider',
        'PROVIDER_MISMATCH',
      );
    }

    if (!OPENAI_MODELS.some((entry) => entry.model === input.model)) {
      throw upstreamError('Provider adapter does not support requested model', 'MODEL_MISMATCH');
    }

    const output = `openai:${input.model}:${input.maxOutputTokens}:${input.prompt}`;
    return {
      output,
      usage: createUsage(input.prompt, output),
      stream: input.stream ? createStream(output) : undefined,
    };
  }
}
