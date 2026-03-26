import type { GatewayHandlerResult, GatewayHttpRequest } from '../contracts/http.js';
import { type CreateGatewayServiceOptions, createGatewayService } from '../http/factory.js';

export interface FetchLikeRequest {
  method: string;
  url: string;
  headers: Headers;
  text(): Promise<string>;
}

const headersToObject = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

export const toGatewayHttpRequest = async (
  request: FetchLikeRequest,
): Promise<GatewayHttpRequest> => {
  const url = new URL(request.url);
  const text = await request.text();

  return {
    method: request.method.toUpperCase(),
    path: url.pathname,
    headers: headersToObject(request.headers),
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

export const toFetchResponse = (result: GatewayHandlerResult): Response => {
  if (result.kind === 'response') {
    return new Response(result.response.body, {
      status: result.response.status,
      headers: result.response.headers,
    });
  }

  return new Response(eventStreamFromChunks(result.response.stream), {
    status: result.response.status,
    headers: result.response.headers,
  });
};

export const createServerlessHandler = (options: CreateGatewayServiceOptions = {}) => {
  const service = createGatewayService(options);

  return async (request: FetchLikeRequest): Promise<Response> => {
    const normalizedRequest = await toGatewayHttpRequest(request);
    const result = await service.handle(normalizedRequest);
    return toFetchResponse(result);
  };
};
