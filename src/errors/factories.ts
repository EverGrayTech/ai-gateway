import { GatewayError } from './gateway-error.js';

export const validationError = (message: string, code = 'VALIDATION_ERROR') =>
  new GatewayError({
    code,
    category: 'validation',
    message,
    status: 400,
  });

export const authenticationError = (message: string, code = 'AUTHENTICATION_ERROR') =>
  new GatewayError({
    code,
    category: 'authentication',
    message,
    status: 401,
  });

export const policyError = (message: string, code = 'POLICY_REJECTED') =>
  new GatewayError({
    code,
    category: 'policy',
    message,
    status: 403,
  });

export const rateLimitError = (message: string, code = 'RATE_LIMIT_EXCEEDED') =>
  new GatewayError({
    code,
    category: 'rate_limit',
    message,
    status: 429,
  });

export const upstreamError = (message: string, code = 'UPSTREAM_ERROR', cause?: unknown) =>
  new GatewayError({
    code,
    category: 'upstream',
    message,
    status: 502,
    cause,
  });

export const internalError = (message = 'Internal server error', cause?: unknown) =>
  new GatewayError({
    code: 'INTERNAL_ERROR',
    category: 'internal',
    message,
    status: 500,
    cause,
    exposeMessage: false,
  });
