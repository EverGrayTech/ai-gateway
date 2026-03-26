import { describe, expect, it } from 'vitest';
import { HmacTokenSigner, createTokenClaims, loadGatewayConfig } from '../../src/index.js';

describe('auth token', () => {
  it('creates signed token claims with enforcement metadata', async () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
    });
    const signer = new HmacTokenSigner(config.signingSecret);
    const claims = createTokenClaims({ appId: 'app', clientId: 'client' }, config, new Date());
    const token = await signer.sign(claims);
    const verified = await signer.verify(token);

    expect(verified.claims.appId).toBe('app');
    expect(verified.claims.clientId).toBe('client');
    expect(verified.claims.constraints.maxInputTokens).toBe(8192);
    expect(verified.claims.constraints.maxOutputTokens).toBe(2048);
    expect(verified.claims.constraints.modelAllowlist).toEqual(['gpt-4o-mini']);
  });

  it('rejects invalid token signatures distinctly', async () => {
    const signer = new HmacTokenSigner('test-secret');

    await expect(signer.verify('abc.def.ghi')).rejects.toMatchObject({
      code: 'INVALID_TOKEN_SIGNATURE',
    });
  });

  it('rejects expired tokens distinctly', async () => {
    const config = loadGatewayConfig({
      NODE_ENV: 'test',
      AI_GATEWAY_SIGNING_SECRET: 'test-secret',
    });
    const signer = new HmacTokenSigner(config.signingSecret);
    const expiredClaims = createTokenClaims(
      { appId: 'app', clientId: 'client' },
      config,
      new Date(Date.now() - 600_000),
    );
    const token = await signer.sign(expiredClaims);

    await expect(signer.verify(token)).rejects.toMatchObject({
      code: 'EXPIRED_TOKEN',
    });
  });
});
