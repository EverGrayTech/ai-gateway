import { describe, expect, it } from 'vitest';
import { createRequestContext, loadGatewayConfig } from '../../src/index.js';

describe('runtime context', () => {
  it('creates normalized request context', () => {
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/auth',
        headers: {
          'x-correlation-id': 'corr-123',
          'user-agent': 'vitest',
        },
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
        remoteAddress: '127.0.0.1',
      },
      loadGatewayConfig({ NODE_ENV: 'test' }),
      { appId: 'app', clientId: 'client' },
    );

    expect(context.identity.appId).toBe('app');
    expect(context.network.ip).toBe('127.0.0.1');
    expect(context.tracing.correlationId).toBe('corr-123');
  });

  it('reads array headers, forwarded-for chains, and generated runtime metadata', () => {
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/auth',
        headers: {
          'user-agent': ['vitest-agent', 'ignored-agent'],
          'x-forwarded-for': ' 203.0.113.10, 198.51.100.5 ',
          'x-request-id': 'req-custom',
          'x-region': 'us-west-2',
          traceparent: '00-abc-123-01',
        },
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
        remoteAddress: '127.0.0.1',
      },
      loadGatewayConfig({ NODE_ENV: 'test' }),
      { appId: ' app ', clientId: ' client ' },
    );

    expect(context.identity).toEqual({ appId: 'app', clientId: 'client' });
    expect(context.network.userAgent).toBe('vitest-agent');
    expect(context.network.forwardedFor).toEqual(['203.0.113.10', '198.51.100.5']);
    expect(context.runtime.requestId).toBe('req-custom');
    expect(context.runtime.region).toBe('us-west-2');
    expect(context.tracing.traceId).toBe('00-abc-123-01');
  });

  it('omits empty forwarded-for values and rejects missing identity context', () => {
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/auth',
        headers: {
          'x-forwarded-for': ' , , ',
        },
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
      },
      loadGatewayConfig({ NODE_ENV: 'test' }),
      { appId: 'app', clientId: 'client' },
    );

    expect(context.network.forwardedFor).toEqual([]);

    expect(() =>
      createRequestContext(
        {
          method: 'POST',
          path: '/auth',
          headers: {},
          body: '{}',
        },
        loadGatewayConfig({ NODE_ENV: 'test' }),
        { appId: ' ', clientId: 'client' },
      ),
    ).toThrowError(/appId and clientId are required/);

    expect(() =>
      createRequestContext(
        {
          method: 'POST',
          path: '/auth',
          headers: {},
          body: '{}',
        },
        loadGatewayConfig({ NODE_ENV: 'test' }),
        undefined,
      ),
    ).toThrowError(/appId and clientId are required/);
  });
});
