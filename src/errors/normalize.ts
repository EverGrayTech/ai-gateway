import type { NormalizedErrorResponse } from '../contracts/api.js';
import type { RequestContext } from '../contracts/context.js';
import { internalError } from './factories.js';
import { GatewayError } from './gateway-error.js';

export const toGatewayError = (error: unknown): GatewayError => {
  if (error instanceof GatewayError) {
    return error;
  }

  return internalError(undefined, error);
};

export const normalizeErrorResponse = (
  error: unknown,
  context: RequestContext,
): { status: number; body: NormalizedErrorResponse } => {
  const gatewayError = toGatewayError(error);
  const safeMessage = gatewayError.exposeMessage ? gatewayError.message : 'Internal server error';

  return {
    status: gatewayError.status,
    body: {
      ok: false,
      code: gatewayError.code,
      category: gatewayError.category,
      message: safeMessage,
      status: gatewayError.status,
      retryable: gatewayError.retryable,
      requestId: context.runtime.requestId,
      details: gatewayError.details,
    },
  };
};
