import type { RequestContext } from '../contracts/context.js';

export const createCorrelationId = (): string => `corr_${Math.random().toString(36).slice(2, 10)}`;

export const createRequestId = (): string => `req_${Math.random().toString(36).slice(2, 10)}`;

export const startRequestTimer = (): { startedAt: number; stop: () => number } => {
  const startedAt = Date.now();

  return {
    startedAt,
    stop: () => Date.now() - startedAt,
  };
};

export const summarizeRequestContext = (context: RequestContext) => ({
  appId: context.identity.appId,
  clientId: context.identity.clientId,
  requestId: context.runtime.requestId,
  correlationId: context.tracing.correlationId,
  environment: context.runtime.environment,
  ip: context.network.ip,
});
