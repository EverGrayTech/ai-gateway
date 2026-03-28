import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServerlessHandler } from '../src/serverless/adapter.js';

const handler = createServerlessHandler();

interface DiagnosticContext {
  stage: string;
  requestKind: 'fetch' | 'node';
  method?: string;
  originalUrl?: string;
  normalizedPath?: string;
  originalPath?: string;
  bodySource?: string;
  bodyLength?: number;
  bodyPreview?: string;
  contentType?: string | null;
  headerKeys?: readonly string[];
  requestBodyShape?: string;
}

const createDiagnosticContext = (): DiagnosticContext => ({
  stage: 'entry',
  requestKind: 'node',
});

const previewBody = (value: string): string => {
  if (!value) {
    return '';
  }

  return value.length <= 160 ? value : `${value.slice(0, 160)}…`;
};

const readNodeRequestBody = async (
  request: IncomingMessage,
  diagnostics: DiagnosticContext,
): Promise<string> => {
  const requestWithBody = request as IncomingMessage & {
    rawBody?: unknown;
  };

  if (typeof requestWithBody.rawBody === 'string') {
    diagnostics.requestBodyShape = 'rawBody:string';
    diagnostics.bodySource = 'node.rawBody:string';
    diagnostics.bodyLength = requestWithBody.rawBody.length;
    diagnostics.bodyPreview = previewBody(requestWithBody.rawBody);
    return requestWithBody.rawBody;
  }

  if (requestWithBody.rawBody instanceof Uint8Array) {
    diagnostics.requestBodyShape = 'rawBody:uint8array';
    const decoded = new TextDecoder().decode(requestWithBody.rawBody);
    diagnostics.bodySource = 'node.rawBody:uint8array';
    diagnostics.bodyLength = decoded.length;
    diagnostics.bodyPreview = previewBody(decoded);
    return decoded;
  }

  if (Buffer.isBuffer(requestWithBody.rawBody)) {
    diagnostics.requestBodyShape = 'rawBody:buffer';
    const decoded = requestWithBody.rawBody.toString('utf8');
    diagnostics.bodySource = 'node.rawBody:buffer';
    diagnostics.bodyLength = decoded.length;
    diagnostics.bodyPreview = previewBody(decoded);
    return decoded;
  }

  diagnostics.requestBodyShape = 'stream-only';

  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    if (typeof chunk === 'string') {
      chunks.push(new TextEncoder().encode(chunk));
      continue;
    }

    chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
  }

  const decoded = new TextDecoder().decode(
    chunks.length === 1 ? chunks[0] : Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
  );
  diagnostics.bodySource = 'node.stream';
  diagnostics.bodyLength = decoded.length;
  diagnostics.bodyPreview = previewBody(decoded);
  return decoded;
};

const cloneHeaders = (headers: Headers): Headers => {
  const cloned = new Headers();
  headers.forEach((value, key) => {
    cloned.set(key, value);
  });
  return cloned;
};

const nodeHeadersToHeaders = (
  headers: IncomingMessage['headers'],
): Headers => {
  const normalized = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'undefined') {
      continue;
    }

    normalized.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  return normalized;
};

const toFetchRequest = async (
  request: Request | IncomingMessage,
  diagnostics: DiagnosticContext,
): Promise<Request> => {
  if (typeof (request as Request).text === 'function') {
    const fetchRequest = request as Request;
    diagnostics.requestKind = 'fetch';
    diagnostics.method = fetchRequest.method;
    diagnostics.originalUrl = fetchRequest.url;
    const url = new URL(fetchRequest.url);
    diagnostics.originalPath = url.pathname;

    if (url.pathname.startsWith('/api/')) {
      url.pathname = url.pathname.slice('/api'.length) || '/';
    }
    diagnostics.normalizedPath = url.pathname;
    diagnostics.contentType = fetchRequest.headers.get('content-type');
    diagnostics.headerKeys = [...fetchRequest.headers.keys()].sort();

    const bodyText =
      fetchRequest.method === 'GET' || fetchRequest.method === 'HEAD'
        ? undefined
        : await fetchRequest.text();
    diagnostics.bodySource =
      fetchRequest.method === 'GET' || fetchRequest.method === 'HEAD' ? 'none' : 'fetch.text';
    diagnostics.bodyLength = bodyText?.length ?? 0;
    diagnostics.bodyPreview = previewBody(bodyText ?? '');

    return new Request(url.toString(), {
      method: fetchRequest.method,
      headers: cloneHeaders(fetchRequest.headers),
      body: bodyText,
    });
  }

  const nodeRequest = request as IncomingMessage;
  diagnostics.requestKind = 'node';
  diagnostics.method = nodeRequest.method;
  diagnostics.originalUrl = nodeRequest.url;
  const headers = nodeHeadersToHeaders(nodeRequest.headers);
  diagnostics.contentType = headers.get('content-type');
  diagnostics.headerKeys = [...headers.keys()].sort();
  const protocol = headers.get('x-forwarded-proto') || 'https';
  const host = headers.get('x-forwarded-host') || headers.get('host') || 'localhost';
  const url = new URL(nodeRequest.url || '/', `${protocol}://${host}`);
  diagnostics.originalPath = url.pathname;
  if (url.pathname.startsWith('/api/')) {
    url.pathname = url.pathname.slice('/api'.length) || '/';
  }
  diagnostics.normalizedPath = url.pathname;
  const method = nodeRequest.method || 'GET';
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await readNodeRequestBody(nodeRequest, diagnostics);
  if (method === 'GET' || method === 'HEAD') {
    diagnostics.bodySource = 'none';
    diagnostics.bodyLength = 0;
    diagnostics.bodyPreview = '';
  }

  return new Request(url.toString(), {
    method,
    headers,
    body,
  });
};

export default async function handleRequest(
  request: Request | IncomingMessage,
  response?: ServerResponse,
): Promise<Response | void> {
  const diagnostics = createDiagnosticContext();

  try {
    diagnostics.stage = 'normalize-request';
    const normalizedRequest = await toFetchRequest(request, diagnostics);

    response?.setHeader('x-ai-gateway-debug-body-source', diagnostics.bodySource ?? 'unknown');
    response?.setHeader('x-ai-gateway-debug-body-length', String(diagnostics.bodyLength ?? -1));
    response?.setHeader('x-ai-gateway-debug-normalized-path', diagnostics.normalizedPath ?? '');
    response?.setHeader('x-ai-gateway-debug-body-preview', encodeURIComponent(diagnostics.bodyPreview ?? ''));

    diagnostics.stage = 'gateway-handler';
    const result = await handler(normalizedRequest);

    if (!response) {
      return result;
    }

    diagnostics.stage = 'write-node-response';
    response.statusCode = result.status;
    result.headers.forEach((value, key) => {
      response.setHeader(key, value);
    });

    const body = await result.text();
    response.end(body);
    return;
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const fallbackBody = JSON.stringify({
      error: 'Entrypoint failure before gateway response serialization',
      detail: normalizedError.message,
      errorName: normalizedError.name,
      stack: normalizedError.stack,
      diagnostics,
    });

    if (!response) {
      return new Response(fallbackBody, {
        status: 500,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      });
    }

    response.statusCode = 500;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(fallbackBody);
    return;
  }
}
