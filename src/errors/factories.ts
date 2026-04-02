import { GatewayError, type GatewayErrorDetails } from './gateway-error.js';

export const validationError = (message: string, code = 'request-invalid', details?: GatewayErrorDetails) =>
  new GatewayError({
    code,
    category: 'validation',
    message,
    status: 400,
    retryable: false,
    details,
  });

export const authenticationError = (
  message: string,
  code = 'token-invalid',
  details?: GatewayErrorDetails,
) =>
  new GatewayError({
    code,
    category: 'authentication',
    message,
    status: 401,
    retryable: false,
    details,
  });

export const policyError = (message: string, code = 'policy-rejected', details?: GatewayErrorDetails) =>
  new GatewayError({
    code,
    category: 'policy',
    message,
    status: 403,
    retryable: false,
    details,
  });

export const rateLimitError = (message: string, code = 'rate-limited', details?: GatewayErrorDetails) =>
  new GatewayError({
    code,
    category: 'rate-limit',
    message,
    status: 429,
    retryable: true,
    details,
  });

export const upstreamError = (
  message: string,
  code = 'upstream-provider-failed',
  cause?: unknown,
  details?: GatewayErrorDetails,
) =>
  new GatewayError({
    code,
    category: 'provider',
    message,
    status: 502,
    retryable: true,
    details,
    cause,
  });

export const internalError = (message = 'Internal server error', cause?: unknown, details?: GatewayErrorDetails) =>
  new GatewayError({
    code: 'internal-error',
    category: 'internal',
    message,
    status: 500,
    retryable: false,
    details,
    cause,
    exposeMessage: false,
  });
