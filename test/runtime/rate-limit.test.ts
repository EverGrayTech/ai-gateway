import { describe, expect, it } from 'vitest';
import {
  ExternalRateLimiter,
  MemoryRateLimiterStore,
  NoopRateLimiter,
  createRateLimitKey,
  createRequestContext,
  loadGatewayConfig,
} from '../../src/index.js';

describe('runtime rate-limit', () => {
  it('creates stable rate limit keys from endpoint, client, and ip context', () => {
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/auth',
        headers: {},
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
        remoteAddress: '127.0.0.1',
      },
      loadGatewayConfig({ NODE_ENV: 'test' }),
      { appId: 'app', clientId: 'client' },
    );

    const key = createRateLimitKey('/auth', context, {
      method: 'POST',
      path: '/auth',
      headers: {},
      body: '{}',
      remoteAddress: '127.0.0.1',
    });

    expect(key).toBe('/auth:client:127.0.0.1');
  });

  it('tracks rate limit windows', async () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
    });
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/auth',
        headers: {},
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
      },
      config,
      { appId: 'app', clientId: 'client' },
    );

    const limiter = new NoopRateLimiter();
    const descriptor = {
      key: 'auth:client',
      limit: 2,
      windowSeconds: 60,
    };

    await expect(
      limiter.check(descriptor, context, { method: 'POST', path: '/auth', headers: {} }),
    ).resolves.toEqual({ allowed: true, remaining: 1 });
    await expect(
      limiter.check(descriptor, context, { method: 'POST', path: '/auth', headers: {} }),
    ).resolves.toEqual({ allowed: true, remaining: 0 });

    const blocked = await limiter.check(descriptor, context, {
      method: 'POST',
      path: '/auth',
      headers: {},
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('supports shared external rate limiting semantics through the adapter port', async () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
    });
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/auth',
        headers: {},
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
      },
      config,
      { appId: 'app', clientId: 'client' },
    );

    const store = new MemoryRateLimiterStore();
    const limiterA = new ExternalRateLimiter({ store });
    const limiterB = new ExternalRateLimiter({ store });
    const descriptor = {
      key: 'auth:client:127.0.0.1',
      limit: 2,
      windowSeconds: 60,
    };

    await expect(
      limiterA.check(descriptor, context, { method: 'POST', path: '/auth', headers: {} }),
    ).resolves.toEqual({ allowed: true, remaining: 1 });
    await expect(
      limiterB.check(descriptor, context, { method: 'POST', path: '/auth', headers: {} }),
    ).resolves.toEqual({ allowed: true, remaining: 0 });

    await expect(
      limiterA.check(descriptor, context, { method: 'POST', path: '/auth', headers: {} }),
    ).resolves.toMatchObject({ allowed: false, remaining: 0 });
  });

  it('fails closed when the external backend is unavailable', async () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
    });
    const context = createRequestContext(
      {
        method: 'POST',
        path: '/auth',
        headers: {},
        body: JSON.stringify({ appId: 'app', clientId: 'client' }),
      },
      config,
      { appId: 'app', clientId: 'client' },
    );

    const limiter = new ExternalRateLimiter({
      store: {
        async increment() {
          throw new Error('backend offline');
        },
      },
    });

    await expect(
      limiter.check({ key: 'auth:client:127.0.0.1', limit: 2, windowSeconds: 60 }, context, {
        method: 'POST',
        path: '/auth',
        headers: {},
      }),
    ).rejects.toMatchObject({ code: 'upstream-provider-failed' });
  });
});
