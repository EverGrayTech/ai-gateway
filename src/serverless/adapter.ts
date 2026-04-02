import type { GatewayHandlerResult, GatewayHttpRequest } from '../contracts/http.js';
import { type CreateGatewayServiceOptions, createGatewayService } from '../http/factory.js';

export interface FetchLikeRequest {
  method: string;
  url: string;
  headers: Headers;
  text(): Promise<string>;
}

type NodeLikeHeaders = Record<string, string | readonly string[] | undefined>;

const ACCESS_CONTROL_ALLOW_METHODS = 'POST, OPTIONS';
const ACCESS_CONTROL_ALLOW_HEADERS = 'content-type, authorization, x-eg-ai-provider-credential';

interface NodeLikeRequest {
  method?: string;
  url?: string;
  headers: NodeLikeHeaders;
  body?: string;
}

interface HeaderAccessor {
  get(name: string): string | null;
  forEach(callback: (value: string, key: string) => void): void;
}

const isFetchLikeHeaders = (headers: Headers | NodeLikeHeaders): headers is Headers =>
  typeof (headers as Headers).get === 'function';

const toHeaderAccessor = (headers: Headers | NodeLikeHeaders): HeaderAccessor => {
  if (isFetchLikeHeaders(headers)) {
    return headers;
  }

  return {
    get(name: string): string | null {
      const value = headers[name.toLowerCase()];

      if (Array.isArray(value)) {
        return value.join(', ');
      }

      return typeof value === 'string' ? value : null;
    },
    forEach(callback) {
      for (const [key, value] of Object.entries(headers)) {
        if (typeof value === 'undefined') {
          continue;
        }

        const normalizedValue = Array.isArray(value) ? value.join(', ') : String(value);
        callback(normalizedValue, key);
      }
    },
  };
};

const isFetchLikeRequest = (request: FetchLikeRequest | NodeLikeRequest): request is FetchLikeRequest =>
  typeof (request as FetchLikeRequest).text === 'function';

const headersToObject = (headers: HeaderAccessor): Record<string, string> => {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

const parseOrigin = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isAllowedOrigin = (origin: string, allowedOrigins: readonly string[]): boolean => {
  const parsedOrigin = parseOrigin(origin);
  if (!parsedOrigin) {
    return false;
  }

  return allowedOrigins.some((pattern) => {
    const trimmedPattern = pattern.trim();
    if (!trimmedPattern) {
      return false;
    }

    if (!trimmedPattern.includes('*')) {
      return origin === trimmedPattern;
    }

    const parsedPattern = parseOrigin(trimmedPattern.replace('*.', 'placeholder.'));
    if (!parsedPattern) {
      return false;
    }

    if (parsedPattern.protocol !== parsedOrigin.protocol) {
      return false;
    }

    const patternHost = trimmedPattern.replace(`${parsedPattern.protocol}//*.`, '');
    return parsedOrigin.hostname.endsWith(`.${patternHost}`);
  });
};

const applyCorsHeaders = (headers: Headers, origin: string | null, allowedOrigins: readonly string[]): void => {
  headers.set('access-control-allow-methods', ACCESS_CONTROL_ALLOW_METHODS);
  headers.set('access-control-allow-headers', ACCESS_CONTROL_ALLOW_HEADERS);
  headers.set('vary', 'Origin');

  if (origin && isAllowedOrigin(origin, allowedOrigins)) {
    headers.set('access-control-allow-origin', origin);
  }
};

const resolveRequestUrl = (requestUrl: string, headers: HeaderAccessor): URL => {
  if (!requestUrl.startsWith('/')) {
    return new URL(requestUrl);
  }

  const forwardedProto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = headers.get('host')?.trim();
  const protocol = forwardedProto || 'https';
  const hostname = forwardedHost || host;

  if (!hostname) {
    throw new TypeError(`Invalid URL: ${requestUrl}`);
  }

  return new URL(requestUrl, `${protocol}://${hostname}`);
};

export const toGatewayHttpRequest = async (
  request: FetchLikeRequest | NodeLikeRequest,
): Promise<GatewayHttpRequest> => {
  const headers = toHeaderAccessor(request.headers);
  const url = resolveRequestUrl(request.url || '/', headers);
  const text = isFetchLikeRequest(request) ? await request.text() : request.body || '';

  return {
    method: (request.method || 'GET').toUpperCase(),
    path: url.pathname,
    headers: headersToObject(headers),
    query: Object.fromEntries(url.searchParams.entries()),
    body: text || undefined,
  };
};

const eventStreamFromChunks = (
  chunks: AsyncIterable<{ event?: string; data: string }>,
): ReadableStream => {
  const iterator = chunks[Symbol.asyncIterator]();

  return new ReadableStream({
    async pull(controller) {
      const encoder = new TextEncoder();
      const next = await iterator.next();

      if (next.done) {
        controller.close();
        return;
      }

      const payload = `${next.value.event ? `event: ${next.value.event}\n` : ''}data: ${next.value.data}\n\n`;
      controller.enqueue(encoder.encode(payload));
    },
    async cancel() {
      if (iterator.return) {
        await iterator.return();
      }
    },
  });
};

export const toFetchResponse = (
  result: GatewayHandlerResult,
  origin: string | null,
  allowedOrigins: readonly string[],
): Response => {
  if (result.kind === 'response') {
    const headers = new Headers(result.response.headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'text/plain; charset=utf-8');
    }

    if (!headers.has('content-length')) {
      headers.set('content-length', new TextEncoder().encode(result.response.body).byteLength.toString());
    }

    applyCorsHeaders(headers, origin, allowedOrigins);

    return new Response(result.response.body, {
      status: result.response.status,
      headers,
    });
  }

  const headers = new Headers(result.response.headers);
  applyCorsHeaders(headers, origin, allowedOrigins);

  return new Response(eventStreamFromChunks(result.response.stream), {
    status: result.response.status,
    headers,
  });
};

export const createServerlessHandler = (options: CreateGatewayServiceOptions = {}) => {
  const service = createGatewayService(options);
  const allowedOrigins = options.config?.adapters.allowedOrigins ?? ['http://localhost:5173'];

  return async (request: FetchLikeRequest | NodeLikeRequest): Promise<Response> => {
    const headers = toHeaderAccessor(request.headers);
    const origin = headers.get('origin');
    if ((request.method || 'GET').toUpperCase() === 'OPTIONS') {
      const responseHeaders = new Headers();
      applyCorsHeaders(responseHeaders, origin, allowedOrigins);
      return new Response(null, { status: 200, headers: responseHeaders });
    }

    const normalizedRequest = await toGatewayHttpRequest(request);
    const result = await service.handle(normalizedRequest);
    return toFetchResponse(result, origin, allowedOrigins);
  };
};
