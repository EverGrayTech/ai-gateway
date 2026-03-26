import { describe, expect, it } from 'vitest';
import {
  GatewayError,
  createRequestContext,
  loadGatewayConfig,
  normalizeErrorResponse,
  toGatewayError,
  validationError,
} from '../../src/index.js';

describe('errors normalize', () => {
  it('normalizes safe error responses', () => {
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/auth',
        headers: {},
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
      },
      loadGatewayConfig({ NODE_ENV: 'test' }),
      { appId: 'app', clientId: 'client' },
    );

    const normalized = normalizeErrorResponse(
      validationError('bad payload', 'BAD_PAYLOAD'),
      context,
    );

    expect(normalized.status).toBe(400);
    expect(normalized.body.error.code).toBe('BAD_PAYLOAD');
    expect(normalized.body.error.requestId).toBe(context.runtime.requestId);
  });

  it('converts unknown errors into internal gateway errors and hides unsafe messages', () => {
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/ai',
        headers: {},
        body: JSON.stringify({ input: 'hello' }),
      },
      loadGatewayConfig({ NODE_ENV: 'test' }),
      { appId: 'app', clientId: 'client' },
    );

    const cause = new Error('boom');
    const gatewayError = toGatewayError(cause);
    const normalized = normalizeErrorResponse(cause, context);

    expect(gatewayError).toBeInstanceOf(GatewayError);
    expect(gatewayError.code).toBe('INTERNAL_ERROR');
    expect(gatewayError.cause).toBe(cause);
    expect(normalized.status).toBe(500);
    expect(normalized.body.error.code).toBe('INTERNAL_ERROR');
    expect(normalized.body.error.message).toBe('Internal server error');
  });

  it('returns gateway errors unchanged when normalizing unknown inputs', () => {
    const gatewayError = validationError('already normalized', 'ALREADY_NORMALIZED');

    expect(toGatewayError(gatewayError)).toBe(gatewayError);
  });
});
