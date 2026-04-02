import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlerMock = vi.fn();

vi.mock('../../src/serverless/adapter.js', () => ({
  createServerlessHandler: () => handlerMock,
}));

type MockIncomingMessage = IncomingMessage & AsyncIterable<Uint8Array | string> & { rawBody?: unknown };

const loadRouteModule = async () => import('../../api/[...route]');

const createNodeRequest = ({
  method = 'POST',
  url = '/api/ai?foo=bar',
  headers = {},
  chunks = [],
  rawBody,
}: {
  method?: string;
  url?: string;
  headers?: IncomingMessage['headers'];
  chunks?: Array<Uint8Array | string | number[]>;
  rawBody?: unknown;
} = {}): MockIncomingMessage => {
  const request = new EventEmitter() as MockIncomingMessage;
  request.method = method;
  request.url = url;
  request.headers = headers;
  request.rawBody = rawBody;
  request[Symbol.asyncIterator] = async function* (): AsyncGenerator<Uint8Array | string, undefined, void> {
    for (const chunk of chunks) {
      yield typeof chunk === 'string' || chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    }

    return undefined;
  };

  return request;
};

const createNodeResponse = (): ServerResponse & {
  body?: string;
  headersRecord: Record<string, string>;
} => {
  const headersRecord: Record<string, string> = {};
  const response: {
    statusCode: number;
    setHeader: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    headersRecord: Record<string, string>;
    body?: string;
  } = {
    statusCode: 200,
    setHeader: vi.fn((key: string, value: string) => {
      headersRecord[key] = value;
    }),
    end: vi.fn((body?: string) => {
      response.body = body;
    }),
    headersRecord,
  };

  return response as unknown as ServerResponse & {
    body?: string;
    headersRecord: Record<string, string>;
  };
};

describe('api/[...route]', () => {
  beforeEach(() => {
    handlerMock.mockReset();
  });

  it('normalizes fetch requests by trimming the /api prefix and preserving body + headers', async () => {
    handlerMock.mockResolvedValue(
      new Response('ok', { status: 201, headers: { 'x-test': 'yes', 'content-type': 'text/plain' } }),
    );

    const { default: handleRequest } = await loadRouteModule();
    const request = new Request('https://example.test/api/ai?foo=bar', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-custom': 'abc' },
      body: JSON.stringify({ hello: 'world' }),
    });

    const response = await handleRequest(request);

    expect(response).toBeInstanceOf(Response);
    const forwardedRequest = handlerMock.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe('https://example.test/ai?foo=bar');
    expect(forwardedRequest.method).toBe('POST');
    expect(forwardedRequest.headers.get('content-type')).toBe('application/json');
    expect(forwardedRequest.headers.get('x-custom')).toBe('abc');
    await expect(forwardedRequest.text()).resolves.toBe('{"hello":"world"}');
    await expect((response as Response).text()).resolves.toBe('ok');
  });

  it('omits bodies for fetch GET requests', async () => {
    handlerMock.mockResolvedValue(new Response('done'));

    const { default: handleRequest } = await loadRouteModule();
    const request = new Request('https://example.test/api/auth', {
      method: 'GET',
      headers: { accept: 'application/json' },
    });

    await handleRequest(request);

    const forwardedRequest = handlerMock.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe('https://example.test/auth');
    await expect(forwardedRequest.text()).resolves.toBe('');
  });

  it('normalizes node requests and writes the fetch response back to ServerResponse', async () => {
    handlerMock.mockResolvedValue(
      new Response('node-ok', {
        status: 202,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'x-node': '1' },
      }),
    );

    const { default: handleRequest } = await loadRouteModule();
    const request = createNodeRequest({
      method: 'POST',
      url: '/api/ai?foo=bar',
      headers: {
        host: 'gateway.test',
        'x-forwarded-proto': 'http',
        'content-type': 'application/json',
        'x-multi': ['a', 'b'],
      },
      chunks: ['{"hi":', '"there"}'],
    });
    const response = createNodeResponse();

    await handleRequest(request, response);

    const forwardedRequest = handlerMock.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe('http://gateway.test/ai?foo=bar');
    expect(forwardedRequest.headers.get('x-multi')).toBe('a, b');
    await expect(forwardedRequest.text()).resolves.toBe('{"hi":"there"}');
    expect(response.statusCode).toBe(202);
    expect(response.setHeader).toHaveBeenCalledWith('content-type', 'text/plain; charset=utf-8');
    expect(response.setHeader).toHaveBeenCalledWith('x-node', '1');
    expect(response.end).toHaveBeenCalledWith('node-ok');
  });

  it('reads node rawBody values from string, Uint8Array, and Buffer inputs', async () => {
    handlerMock.mockResolvedValue(new Response('ok'));
    const { default: handleRequest } = await loadRouteModule();

    await handleRequest(
      createNodeRequest({
        headers: { host: 'example.test' },
        rawBody: '{"kind":"string"}',
      }),
    );
    await handleRequest(
      createNodeRequest({
        headers: { host: 'example.test' },
        rawBody: new TextEncoder().encode('{"kind":"bytes"}'),
      }),
    );
    await handleRequest(
      createNodeRequest({
        headers: { host: 'example.test' },
        rawBody: Buffer.from('{"kind":"buffer"}', 'utf8'),
      }),
    );

    const forwardedBodies = await Promise.all(
      handlerMock.mock.calls.map(async ([request]) => (request as Request).text()),
    );
    expect(forwardedBodies).toEqual([
      '{"kind":"string"}',
      '{"kind":"bytes"}',
      '{"kind":"buffer"}',
    ]);
  });

  it('handles node Buffer rawBody, undefined headers, and HEAD requests without a body', async () => {
    handlerMock.mockResolvedValue(new Response('ok'));
    const { default: handleRequest } = await loadRouteModule();

    await handleRequest(
      createNodeRequest({
        method: 'POST',
        url: '/api/ai',
        headers: { host: 'buffer.test', unused: undefined },
        rawBody: Buffer.from('{"buffer":true}', 'utf8'),
      }),
    );
    await handleRequest(
      createNodeRequest({
        method: 'HEAD',
        url: '/api/status',
        headers: { host: 'head.test' },
      }),
    );

    const postRequest = handlerMock.mock.calls[0]?.[0] as Request;
    const headRequest = handlerMock.mock.calls[1]?.[0] as Request;
    await expect(postRequest.text()).resolves.toBe('{"buffer":true}');
    await expect(headRequest.text()).resolves.toBe('');
    expect(headRequest.url).toBe('https://head.test/status');
  });

  it('returns fallback fetch responses when normalization or handler execution throws', async () => {
    const { default: handleRequest } = await loadRouteModule();
    const invalidFetchRequest = {
      method: 'POST',
      url: 'not-a-valid-url',
      headers: new Headers(),
      text: async () => 'boom',
    } as Request;

    const normalizationFailure = (await handleRequest(invalidFetchRequest)) as Response;
    expect(normalizationFailure.status).toBe(500);
    await expect(normalizationFailure.json()).resolves.toMatchObject({
      error: 'Entrypoint failure before gateway response serialization',
      detail: 'Invalid URL',
      diagnostics: expect.objectContaining({ stage: 'normalize-request', requestKind: 'fetch' }),
    });

    handlerMock.mockRejectedValueOnce(new Error('gateway exploded'));
    const handlerFailure = (await handleRequest(
      new Request('https://example.test/api/ai', { method: 'POST', body: 'boom' }),
    )) as Response;
    expect(handlerFailure.status).toBe(500);
    await expect(handlerFailure.json()).resolves.toMatchObject({
      detail: 'gateway exploded',
      diagnostics: expect.objectContaining({ stage: 'gateway-handler', requestKind: 'fetch' }),
    });
  });

  it('writes fallback error responses to ServerResponse when node handling fails', async () => {
    handlerMock.mockRejectedValueOnce(new Error('node gateway failure'));

    const { default: handleRequest } = await loadRouteModule();
    const request = createNodeRequest({
      method: 'POST',
      url: '/api/ai',
      headers: { host: 'example.test', 'content-type': 'application/json' },
      rawBody: '{"x":1}',
    });
    const response = createNodeResponse();

    await handleRequest(request, response);

    expect(response.statusCode).toBe(500);
    expect(response.setHeader).toHaveBeenCalledWith('content-type', 'application/json; charset=utf-8');
    expect(response.end).toHaveBeenCalledTimes(1);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      detail: 'node gateway failure',
      diagnostics: expect.objectContaining({ stage: 'gateway-handler', bodySource: 'node.rawBody:string' }),
    });
  });
});
