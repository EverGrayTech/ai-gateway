import type { ProviderCredentialSet } from '../contracts/config.js';
import type { RequestContext } from '../contracts/context.js';
import type { ProviderModelMetadata } from '../contracts/provider.js';
import { upstreamError } from '../errors/factories.js';
import type { ProviderExecutorPort } from '../runtime/ports.js';
import { createProviderMetadata } from './catalog.js';

const OPENROUTER_MODELS: readonly ProviderModelMetadata[] = createProviderMetadata('openrouter');

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

interface OpenRouterProviderExecutorOptions {
  credentials?: ProviderCredentialSet;
  fetchFn?: typeof fetch;
}

interface OpenRouterChatCompletionRequestBody {
  model: string;
  messages: Array<{
    role: 'user';
    content: string;
  }>;
  max_tokens: number;
  stream?: boolean;
}

interface OpenRouterChatCompletionResponseBody {
  choices?: Array<{
    message?: {
      content?: string;
    };
    delta?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface OpenRouterErrorBody {
  error?: {
    message?: string;
    code?: string;
  };
}

const resolveBaseUrl = (credentials?: ProviderCredentialSet): string =>
  (credentials?.baseUrl?.trim() || DEFAULT_OPENROUTER_BASE_URL).replace(/\/$/, '');

const createRequestBody = (input: {
  model: string;
  prompt: string;
  maxOutputTokens: number;
  stream: boolean;
}): OpenRouterChatCompletionRequestBody => ({
  model: input.model,
  messages: [{ role: 'user', content: input.prompt }],
  max_tokens: input.maxOutputTokens,
  ...(input.stream ? { stream: true } : {}),
});

const extractOutputText = (body: OpenRouterChatCompletionResponseBody): string =>
  (body.choices ?? []).map((choice) => choice.message?.content ?? '').join('');

const normalizeUsage = (usage?: OpenRouterChatCompletionResponseBody['usage']) => {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
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

const toUpstreamFailure = (
  responseStatus: number,
  body: OpenRouterErrorBody | undefined,
): Error => {
  const rawMessage = body?.error?.message?.trim();

  if (responseStatus === 400) {
    return upstreamError(rawMessage || 'OpenRouter request was rejected', 'OPENROUTER_BAD_REQUEST');
  }

  if (responseStatus === 401 || responseStatus === 403) {
    return upstreamError('OpenRouter credentials were rejected', 'OPENROUTER_AUTH_ERROR');
  }

  if (responseStatus === 429) {
    return upstreamError('OpenRouter rate limit exceeded', 'OPENROUTER_RATE_LIMIT');
  }

  if (responseStatus >= 500) {
    return upstreamError('OpenRouter upstream is unavailable', 'OPENROUTER_UNAVAILABLE');
  }

  return upstreamError(rawMessage || 'OpenRouter request failed', 'OPENROUTER_UPSTREAM_ERROR');
};

const parseSseEvent = (rawEvent: string): { data: string } | undefined => {
  const dataLines = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart());

  if (dataLines.length === 0) {
    return undefined;
  }

  return { data: dataLines.join('\n') };
};

const createSseStream = async function* (
  response: Response,
): AsyncIterable<{ event?: string; data: string }> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw upstreamError(
      'OpenRouter stream did not provide a readable body',
      'OPENROUTER_STREAM_ERROR',
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
        if (!parsed || parsed.data === '[DONE]') {
          continue;
        }

        let payload: OpenRouterChatCompletionResponseBody | undefined;
        try {
          payload = JSON.parse(parsed.data) as OpenRouterChatCompletionResponseBody;
        } catch {
          continue;
        }

        const delta = payload.choices?.[0]?.delta?.content;
        if (delta) {
          yield { event: 'message', data: delta };
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

export class OpenRouterProviderExecutor implements ProviderExecutorPort {
  public readonly metadata = OPENROUTER_MODELS;
  readonly #credentials?: ProviderCredentialSet;
  readonly #fetchFn: typeof fetch;

  public constructor(options: OpenRouterProviderExecutorOptions = {}) {
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
    credentialsOverride?: ProviderCredentialSet;
  }): Promise<{
    output: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    stream?: AsyncIterable<{ event?: string; data: string }>;
  }> {
    if (input.provider !== 'openrouter') {
      throw upstreamError(
        'Provider adapter does not support requested provider',
        'PROVIDER_MISMATCH',
      );
    }

    const resolvedCredentials = input.credentialsOverride ?? this.#credentials;
    const apiKey = resolvedCredentials?.apiKey?.trim();
    if (!apiKey) {
      throw upstreamError(
        'OpenRouter provider is not configured',
        'OPENROUTER_MISSING_CREDENTIALS',
      );
    }

    const response = await this.#fetchFn(`${resolveBaseUrl(resolvedCredentials)}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(createRequestBody(input)),
    });

    if (!response.ok) {
      throw toUpstreamFailure(response.status, await readJsonSafely<OpenRouterErrorBody>(response));
    }

    if (input.stream) {
      return {
        output: '',
        stream: createSseStream(response),
      };
    }

    const body = await readJsonSafely<OpenRouterChatCompletionResponseBody>(response);
    if (!body) {
      throw upstreamError(
        'OpenRouter returned an invalid JSON payload',
        'OPENROUTER_INVALID_RESPONSE',
      );
    }

    const output = extractOutputText(body);
    return {
      output,
      usage: normalizeUsage(body.usage),
    };
  }
}
