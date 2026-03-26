import type { ProviderCredentialSet } from '../contracts/config.js';
import type { RequestContext } from '../contracts/context.js';
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

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com';

interface OpenAiProviderExecutorOptions {
  credentials?: ProviderCredentialSet;
  fetchFn?: typeof fetch;
}

interface OpenAiResponseInputText {
  type: 'input_text';
  text: string;
}

interface OpenAiResponseInputMessage {
  role: 'user';
  content: OpenAiResponseInputText[];
}

interface OpenAiResponsesRequestBody {
  model: string;
  input: OpenAiResponseInputMessage[];
  max_output_tokens: number;
  stream?: boolean;
}

interface OpenAiOutputTextContent {
  type: 'output_text';
  text?: string;
}

interface OpenAiOutputMessage {
  type?: string;
  content?: OpenAiOutputTextContent[];
}

interface OpenAiResponsesSuccessBody {
  model?: string;
  output?: OpenAiOutputMessage[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

interface OpenAiErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

const toGatewayStreamChunk = (data: string) => ({ event: 'message', data });

const resolveBaseUrl = (credentials?: ProviderCredentialSet): string =>
  (credentials?.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '');

const createRequestBody = (input: {
  model: string;
  prompt: string;
  maxOutputTokens: number;
  stream: boolean;
}): OpenAiResponsesRequestBody => ({
  model: input.model,
  input: [
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: input.prompt,
        },
      ],
    },
  ],
  max_output_tokens: input.maxOutputTokens,
  ...(input.stream ? { stream: true } : {}),
});

const extractOutputText = (body: OpenAiResponsesSuccessBody): string =>
  (body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text ?? '')
    .join('');

const normalizeUsage = (usage?: OpenAiResponsesSuccessBody['usage']) => {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
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

const toUpstreamFailure = (responseStatus: number, body: OpenAiErrorBody | undefined): Error => {
  const rawMessage = body?.error?.message?.trim();

  if (responseStatus === 400) {
    return upstreamError(rawMessage || 'OpenAI request was rejected', 'OPENAI_BAD_REQUEST');
  }

  if (responseStatus === 401 || responseStatus === 403) {
    return upstreamError('OpenAI credentials were rejected', 'OPENAI_AUTH_ERROR');
  }

  if (responseStatus === 429) {
    return upstreamError('OpenAI rate limit exceeded', 'OPENAI_RATE_LIMIT');
  }

  if (responseStatus >= 500) {
    return upstreamError('OpenAI upstream is unavailable', 'OPENAI_UNAVAILABLE');
  }

  return upstreamError(rawMessage || 'OpenAI request failed', 'OPENAI_UPSTREAM_ERROR');
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
    throw upstreamError('OpenAI stream did not provide a readable body', 'OPENAI_STREAM_ERROR');
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

        if (parsed.data === '[DONE]') {
          return;
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
          (payload as { type?: string }).type === 'response.output_text.delta'
        ) {
          const delta = (payload as { delta?: string }).delta;
          if (typeof delta === 'string' && delta.length > 0) {
            yield toGatewayStreamChunk(delta);
          }
          continue;
        }

        if (
          payload &&
          typeof payload === 'object' &&
          'type' in payload &&
          (payload as { type?: string }).type === 'error'
        ) {
          throw upstreamError('OpenAI streaming request failed', 'OPENAI_STREAM_ERROR');
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

export class OpenAiProviderExecutor implements ProviderExecutorPort {
  public readonly metadata = OPENAI_MODELS;
  readonly #credentials?: ProviderCredentialSet;
  readonly #fetchFn: typeof fetch;

  public constructor(options: OpenAiProviderExecutorOptions = {}) {
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
    if (input.provider !== 'openai') {
      throw upstreamError(
        'Provider adapter does not support requested provider',
        'PROVIDER_MISMATCH',
      );
    }

    if (!OPENAI_MODELS.some((entry) => entry.model === input.model)) {
      throw upstreamError('Provider adapter does not support requested model', 'MODEL_MISMATCH');
    }

    const apiKey = this.#credentials?.apiKey?.trim();
    if (!apiKey) {
      throw upstreamError('OpenAI provider is not configured', 'OPENAI_MISSING_CREDENTIALS');
    }

    const response = await this.#fetchFn(`${resolveBaseUrl(this.#credentials)}/v1/responses`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(createRequestBody(input)),
    });

    if (!response.ok) {
      throw toUpstreamFailure(response.status, await readJsonSafely<OpenAiErrorBody>(response));
    }

    if (input.stream) {
      return {
        output: '',
        stream: createSseStream(response),
      };
    }

    const body = await readJsonSafely<OpenAiResponsesSuccessBody>(response);
    if (!body) {
      throw upstreamError('OpenAI returned an invalid JSON payload', 'OPENAI_INVALID_RESPONSE');
    }

    const output = extractOutputText(body);
    return {
      output,
      usage: normalizeUsage(body.usage),
    };
  }
}
