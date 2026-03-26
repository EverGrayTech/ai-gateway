import { createHmac, timingSafeEqual } from 'node:crypto';

import { MAX_IDENTIFIER_LENGTH } from '../contracts/api.js';
import type { GatewayConfig } from '../contracts/config.js';
import { authenticationError } from '../errors/factories.js';

export interface TokenConstraints {
  maxInputTokens: number;
  maxOutputTokens: number;
  modelAllowlist?: readonly string[];
  metadata?: Readonly<Record<string, string>>;
}

export interface GatewayTokenClaims {
  appId: string;
  clientId: string;
  exp: number;
  iat: number;
  iss: 'evergray-ai-gateway';
  constraints: TokenConstraints;
}

export interface VerifiedGatewayToken {
  claims: GatewayTokenClaims;
}

export interface TokenSigner {
  sign(claims: GatewayTokenClaims): Promise<string>;
  verify(token: string): Promise<VerifiedGatewayToken>;
}

const encodeBase64Url = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

const decodeBase64Url = (value: string): string => Buffer.from(value, 'base64url').toString('utf8');

const parseToken = (token: string): { header: string; payload: string; signature: string } => {
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw authenticationError('Token is malformed', 'MALFORMED_TOKEN');
  }

  const [header, payload, signature] = segments;
  if (!header || !payload || !signature) {
    throw authenticationError('Token is malformed', 'MALFORMED_TOKEN');
  }

  return { header, payload, signature };
};

const signValue = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value).digest('base64url');

const safeSignatureEquals = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

const parseClaims = (payload: string): GatewayTokenClaims => {
  try {
    return JSON.parse(decodeBase64Url(payload)) as GatewayTokenClaims;
  } catch {
    throw authenticationError('Token is malformed', 'MALFORMED_TOKEN');
  }
};

const validateClaims = (claims: GatewayTokenClaims): GatewayTokenClaims => {
  if (!claims.appId || !claims.clientId) {
    throw authenticationError('Token is malformed', 'MALFORMED_TOKEN');
  }

  if (
    claims.appId.length > MAX_IDENTIFIER_LENGTH ||
    claims.clientId.length > MAX_IDENTIFIER_LENGTH ||
    claims.iss !== 'evergray-ai-gateway'
  ) {
    throw authenticationError('Token is malformed', 'MALFORMED_TOKEN');
  }

  if (!Number.isFinite(claims.exp) || !Number.isFinite(claims.iat)) {
    throw authenticationError('Token is malformed', 'MALFORMED_TOKEN');
  }

  if (claims.iat > claims.exp) {
    throw authenticationError('Token is malformed', 'MALFORMED_TOKEN');
  }

  if (claims.exp * 1000 <= Date.now()) {
    throw authenticationError('Token is expired', 'EXPIRED_TOKEN');
  }

  return claims;
};

export class HmacTokenSigner implements TokenSigner {
  readonly #secret: string;

  public constructor(secret: string) {
    this.#secret = secret;
  }

  public async sign(claims: GatewayTokenClaims): Promise<string> {
    const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = encodeBase64Url(JSON.stringify(claims));
    const unsignedToken = `${header}.${payload}`;
    const signature = signValue(this.#secret, unsignedToken);
    return `${unsignedToken}.${signature}`;
  }

  public async verify(token: string): Promise<VerifiedGatewayToken> {
    const { header, payload, signature } = parseToken(token);
    const expectedSignature = signValue(this.#secret, `${header}.${payload}`);

    if (!safeSignatureEquals(signature, expectedSignature)) {
      throw authenticationError('Token signature is invalid', 'INVALID_TOKEN_SIGNATURE');
    }

    const claims = validateClaims(parseClaims(payload));
    return { claims };
  }
}

export const createTokenClaims = (
  input: {
    appId: string;
    clientId: string;
    modelAllowlist?: readonly string[];
  },
  config: GatewayConfig,
  now = new Date(),
): GatewayTokenClaims => {
  const iat = Math.floor(now.getTime() / 1000);
  const ttlSeconds = Math.min(config.defaults.tokenTtlSeconds, 300);
  const exp = iat + ttlSeconds;

  return {
    appId: input.appId,
    clientId: input.clientId,
    iat,
    exp,
    iss: 'evergray-ai-gateway',
    constraints: {
      maxInputTokens: config.defaults.maxInputTokens,
      maxOutputTokens: config.defaults.maxOutputTokens,
      modelAllowlist: input.modelAllowlist ?? [config.defaults.defaultModel],
    },
  };
};
