import type { ProviderCredentialSet } from '../contracts/config.js';
import type { RequestContext } from '../contracts/context.js';
import type { ProviderModelMetadata } from '../contracts/provider.js';
import { upstreamError } from '../errors/factories.js';
import type { ProviderExecutorPort } from '../runtime/ports.js';
import { createProviderMetadata } from './catalog.js';

const GEMINI_MODELS: readonly ProviderModelMetadata[] = createProviderMetadata('gemini');

const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

interface GeminiProviderExecutorOptions {
  credentials?: ProviderCredentialSet;
  fetchFn?: typeof fetch;
}

interface GeminiGenerateContentRequestBody {
  contents: Array<{
    role: 'user';
    parts: Array<{ text: string }>;
  }>;
  generationConfig: {
    maxOutputTokens: number;
  };
}

interface GeminiCandidatePart {
  text?: string;
}

interface GeminiGenerateContentResponseBody {
  candidates?: Array<{
    content?: {
      parts?: GeminiCandidatePart[];
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

interface GeminiErrorBody {
  error?: {
    message?: string;
    status?: string;
  };
}

const resolveBaseUrl = (credentials?: ProviderCredentialSet): string =>
  (credentials?.baseUrl?.trim() || DEFAULT_GEMINI_BASE_URL).replace(/\/$/, '');

const createRequestBody = (input: {
  prompt: string;
  maxOutputTokens: number;
}): GeminiGenerateContentRequestBody => ({
  contents: [
    {
      role: 'user',
      parts: [{ text: input.prompt }],
    },
  ],
  generationConfig: {
    maxOutputTokens: input.maxOutputTokens,
  },
});

const extractOutputText = (body: GeminiGenerateContentResponseBody): string =>
  (body.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('');

const normalizeUsage = (usage?: GeminiGenerateContentResponseBody['usageMetadata']) => {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.promptTokenCount,
    outputTokens: usage.candidatesTokenCount,
    totalTokens: usage.totalTokenCount,
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

const toUpstreamFailure = (responseStatus: number, body: GeminiErrorBody | undefined): Error => {
  const rawMessage = body?.error?.message?.trim();

  if (responseStatus === 400) {
    return upstreamError(rawMessage || 'Gemini request was rejected', 'GEMINI_BAD_REQUEST');
  }

  if (responseStatus === 401 || responseStatus === 403) {
    return upstreamError('Gemini credentials were rejected', 'GEMINI_AUTH_ERROR');
  }

  if (responseStatus === 429) {
    return upstreamError('Gemini rate limit exceeded', 'GEMINI_RATE_LIMIT');
  }

  if (responseStatus >= 500) {
    return upstreamError('Gemini upstream is unavailable', 'GEMINI_UNAVAILABLE');
  }

  return upstreamError(rawMessage || 'Gemini request failed', 'GEMINI_UPSTREAM_ERROR');
};

const createStream = async function* (input: {
  fetchFn: typeof fetch;
  url: string;
  apiKey: string;
  prompt: string;
  maxOutputTokens: number;
}): AsyncIterable<{ event?: string; data: string }> {
  const response = await input.fetchFn(input.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': input.apiKey,
    },
    body: JSON.stringify(createRequestBody(input)),
  });

  if (!response.ok) {
    throw toUpstreamFailure(response.status, await readJsonSafely<GeminiErrorBody>(response));
  }

  const body = await readJsonSafely<
    GeminiGenerateContentResponseBody[] | GeminiGenerateContentResponseBody
  >(response);
  const chunks = Array.isArray(body) ? body : body ? [body] : [];

  for (const chunk of chunks) {
    const text = extractOutputText(chunk);
    if (text) {
      yield { event: 'message', data: text };
    }
  }
};

export class GeminiProviderExecutor implements ProviderExecutorPort {
  public readonly metadata = GEMINI_MODELS;
  readonly #credentials?: ProviderCredentialSet;
  readonly #fetchFn: typeof fetch;

  public constructor(options: GeminiProviderExecutorOptions = {}) {
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
    if (input.provider !== 'gemini') {
      throw upstreamError(
        'Provider adapter does not support requested provider',
        'PROVIDER_MISMATCH',
      );
    }

    if (!GEMINI_MODELS.some((entry) => entry.model === input.model)) {
      throw upstreamError('Provider adapter does not support requested model', 'MODEL_MISMATCH');
    }

    const apiKey = this.#credentials?.apiKey?.trim();
    if (!apiKey) {
      throw upstreamError('Gemini provider is not configured', 'GEMINI_MISSING_CREDENTIALS');
    }

    const baseUrl = resolveBaseUrl(this.#credentials);
    const nonStreamingUrl = `${baseUrl}/v1beta/models/${input.model}:generateContent`;

    if (input.stream) {
      return {
        output: '',
        stream: createStream({
          fetchFn: this.#fetchFn,
          url: `${baseUrl}/v1beta/models/${input.model}:streamGenerateContent?alt=sse`,
          apiKey,
          prompt: input.prompt,
          maxOutputTokens: input.maxOutputTokens,
        }),
      };
    }

    const response = await this.#fetchFn(nonStreamingUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(createRequestBody(input)),
    });

    if (!response.ok) {
      throw toUpstreamFailure(response.status, await readJsonSafely<GeminiErrorBody>(response));
    }

    const body = await readJsonSafely<GeminiGenerateContentResponseBody>(response);
    if (!body) {
      throw upstreamError('Gemini returned an invalid JSON payload', 'GEMINI_INVALID_RESPONSE');
    }

    const output = extractOutputText(body);
    return {
      output,
      usage: normalizeUsage(body.usageMetadata),
    };
  }
}
