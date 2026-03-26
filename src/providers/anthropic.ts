import type { ProviderCredentialSet } from '../contracts/config.js';
import type { RequestContext } from '../contracts/context.js';
import type { ProviderModelMetadata } from '../contracts/provider.js';
import { upstreamError } from '../errors/factories.js';
import type { ProviderExecutorPort } from '../runtime/ports.js';

const ANTHROPIC_MODELS: readonly ProviderModelMetadata[] = [
  {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-latest',
    supportsStreaming: true,
  },
];

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

interface AnthropicProviderExecutorOptions {
  credentials?: ProviderCredentialSet;
  fetchFn?: typeof fetch;
}

interface AnthropicMessagesRequestBody {
  model: string;
  max_tokens: number;
  messages: Array<{
    role: 'user';
    content: string;
  }>;
  stream?: boolean;
}

interface AnthropicTextContent {
  type: 'text';
  text?: string;
}

interface AnthropicMessagesResponseBody {
  content?: AnthropicTextContent[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface AnthropicErrorBody {
  error?: {
    message?: string;
    type?: string;
  };
}

const resolveBaseUrl = (credentials?: ProviderCredentialSet): string =>
  (credentials?.baseUrl?.trim() || DEFAULT_ANTHROPIC_BASE_URL).replace(/\/$/, '');

const createRequestBody = (input: {
  model: string;
  prompt: string;
  maxOutputTokens: number;
  stream: boolean;
}): AnthropicMessagesRequestBody => ({
  model: input.model,
  max_tokens: input.maxOutputTokens,
  messages: [
    {
      role: 'user',
      content: input.prompt,
    },
  ],
  ...(input.stream ? { stream: true } : {}),
});

const extractOutputText = (body: AnthropicMessagesResponseBody): string =>
  (body.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('');

const normalizeUsage = (usage?: AnthropicMessagesResponseBody['usage']) => {
  if (!usage) {
    return undefined;
  }

  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const totalTokens =
    typeof inputTokens === 'number' && typeof outputTokens === 'number'
      ? inputTokens + outputTokens
      : undefined;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
};

const readJsonSafely = async <T>(response: Response): Promise<T | undefined> => {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
};

const toUpstreamFailure = (responseStatus: number, body: AnthropicErrorBody | undefined): Error => {
  const rawMessage = body?.error?.message?.trim();

  if (responseStatus === 400) {
    return upstreamError(rawMessage || 'Anthropic request was rejected', 'ANTHROPIC_BAD_REQUEST');
  }

  if (responseStatus === 401 || responseStatus === 403) {
    return upstreamError('Anthropic credentials were rejected', 'ANTHROPIC_AUTH_ERROR');
  }

  if (responseStatus === 429) {
    return upstreamError('Anthropic rate limit exceeded', 'ANTHROPIC_RATE_LIMIT');
  }

  if (responseStatus >= 500) {
    return upstreamError('Anthropic upstream is unavailable', 'ANTHROPIC_UNAVAILABLE');
  }

  return upstreamError(rawMessage || 'Anthropic request failed', 'ANTHROPIC_UPSTREAM_ERROR');
};

const parseSseEvent = (rawEvent: string): { event?: string; data: string } | undefined => {
  const lines = rawEvent
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  let event: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return undefined;
  }

  return {
    event,
    data: dataLines.join('\n'),
  };
};

const createSseStream = async function* (
  response: Response,
): AsyncIterable<{ event?: string; data: string }> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw upstreamError(
      'Anthropic stream did not provide a readable body',
      'ANTHROPIC_STREAM_ERROR',
    );
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }

      buffer += decoder.decode(next.value, { stream: true });

      while (true) {
        const boundaryIndex = buffer.indexOf('\n\n');
        if (boundaryIndex === -1) {
          break;
        }

        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);
        const parsed = parseSseEvent(rawEvent);

        if (!parsed) {
          continue;
        }

        let payload: unknown;
        try {
          payload = JSON.parse(parsed.data) as unknown;
        } catch {
          continue;
        }

        if (
          payload &&
          typeof payload === 'object' &&
          'type' in payload &&
          (payload as { type?: string }).type === 'content_block_delta'
        ) {
          const delta = (payload as { delta?: { text?: string } }).delta?.text;
          if (typeof delta === 'string' && delta.length > 0) {
            yield { event: 'message', data: delta };
          }
          continue;
        }

        if (
          payload &&
          typeof payload === 'object' &&
          'type' in payload &&
          (payload as { type?: string }).type === 'error'
        ) {
          throw upstreamError('Anthropic streaming request failed', 'ANTHROPIC_STREAM_ERROR');
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore cancellation cleanup failures during stream teardown.
    }
    reader.releaseLock();
  }
};

export class AnthropicProviderExecutor implements ProviderExecutorPort {
  public readonly metadata = ANTHROPIC_MODELS;
  readonly #credentials?: ProviderCredentialSet;
  readonly #fetchFn: typeof fetch;

  public constructor(options: AnthropicProviderExecutorOptions = {}) {
    this.#credentials = options.credentials;
    this.#fetchFn = options.fetchFn ?? fetch;
  }

  public async execute(input: {
    provider: string;
    model: string;
    prompt: string;
    stream: boolean;
    maxOutputTokens: number;
    context: RequestContext;
  }): Promise<{
    output: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    stream?: AsyncIterable<{ event?: string; data: string }>;
  }> {
    if (input.provider !== 'anthropic') {
      throw upstreamError(
        'Provider adapter does not support requested provider',
        'PROVIDER_MISMATCH',
      );
    }

    if (!ANTHROPIC_MODELS.some((entry) => entry.model === input.model)) {
      throw upstreamError('Provider adapter does not support requested model', 'MODEL_MISMATCH');
    }

    const apiKey = this.#credentials?.apiKey?.trim();
    if (!apiKey) {
      throw upstreamError('Anthropic provider is not configured', 'ANTHROPIC_MISSING_CREDENTIALS');
    }

    const response = await this.#fetchFn(`${resolveBaseUrl(this.#credentials)}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(createRequestBody(input)),
    });

    if (!response.ok) {
      throw toUpstreamFailure(response.status, await readJsonSafely<AnthropicErrorBody>(response));
    }

    if (input.stream) {
      return {
        output: '',
        stream: createSseStream(response),
      };
    }

    const body = await readJsonSafely<AnthropicMessagesResponseBody>(response);
    if (!body) {
      throw upstreamError(
        'Anthropic returned an invalid JSON payload',
        'ANTHROPIC_INVALID_RESPONSE',
      );
    }

    const output = extractOutputText(body);
    return {
      output,
      usage: normalizeUsage(body.usage),
    };
  }
}
