import type { GatewayConfig } from '../contracts/config.js';
import type { RequestContext } from '../contracts/context.js';
import type { GatewayHttpRequest } from '../contracts/http.js';
import { validationError } from '../errors/factories.js';
import { createCorrelationId, createRequestId } from '../observability/request.js';

const getHeader = (request: GatewayHttpRequest, name: string): string | undefined => {
  const match = Object.entries(request.headers).find(
    ([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
  )?.[1];

  if (Array.isArray(match)) {
    return match[0];
  }

  return typeof match === 'string' ? match : undefined;
};

const splitForwardedFor = (value?: string): readonly string[] | undefined =>
  value
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean);

export const createRequestContext = (
  request: GatewayHttpRequest,
  config: GatewayConfig,
  identity?: { appId?: string; clientId?: string },
): RequestContext => {
  const appId = identity?.appId?.trim();
  const clientId = identity?.clientId?.trim();

  if (!appId || !clientId) {
    throw validationError('appId and clientId are required', 'MISSING_IDENTITY_CONTEXT');
  }

  return {
    identity: {
      appId,
      clientId,
    },
    network: {
      ip: request.remoteAddress,
      userAgent: getHeader(request, 'user-agent'),
      forwardedFor: splitForwardedFor(getHeader(request, 'x-forwarded-for')),
    },
    runtime: {
      requestId: getHeader(request, 'x-request-id') || createRequestId(),
      receivedAt: new Date().toISOString(),
      environment: config.environment,
      region: getHeader(request, 'x-region'),
    },
    tracing: {
      correlationId: getHeader(request, 'x-correlation-id') || createCorrelationId(),
      traceId: getHeader(request, 'traceparent'),
    },
  };
};
