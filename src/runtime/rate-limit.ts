import type { RequestContext } from '../contracts/context.js';
import type { GatewayHttpRequest } from '../contracts/http.js';
import { rateLimitError } from '../errors/factories.js';
import type { RateLimitDescriptor } from './ports.js';

export interface RateLimitPolicySet {
  auth: Omit<RateLimitDescriptor, 'key'>;
  ai: Omit<RateLimitDescriptor, 'key'>;
}

export const DEFAULT_RATE_LIMIT_POLICIES: RateLimitPolicySet = {
  auth: {
    limit: 10,
    windowSeconds: 60,
  },
  ai: {
    limit: 30,
    windowSeconds: 60,
  },
};

const normalizeSegment = (value?: string): string => value?.trim() || 'unknown';

export const createRateLimitKey = (
  endpoint: string,
  context: RequestContext,
  request: GatewayHttpRequest,
): string => {
  const ip = normalizeSegment(
    context.network.ip ?? context.network.forwardedFor?.[0] ?? request.remoteAddress,
  );
  const clientId = normalizeSegment(context.identity.clientId);
  return `${endpoint}:${clientId}:${ip}`;
};

export const resolveRateLimitDescriptor = (
  endpoint: '/auth' | '/ai',
  context: RequestContext,
  request: GatewayHttpRequest,
  policies: RateLimitPolicySet = DEFAULT_RATE_LIMIT_POLICIES,
): RateLimitDescriptor => ({
  key: createRateLimitKey(endpoint, context, request),
  ...policies[endpoint === '/auth' ? 'auth' : 'ai'],
});

export const assertRateLimitAllowed = (allowed: boolean, retryAfterSeconds?: number): void => {
  if (!allowed) {
    throw rateLimitError(
      retryAfterSeconds ? `Retry after ${retryAfterSeconds} seconds` : 'Rate limit exceeded',
    );
  }
};
