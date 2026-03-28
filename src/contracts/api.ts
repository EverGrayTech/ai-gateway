export interface AuthRequestBody {
  appId: string;
  clientId: string;
  modelAllowlist?: readonly string[];
}

export const MAX_IDENTIFIER_LENGTH = 64;
const IDENTIFIER_PATTERN = /^[a-z0-9](?:[a-z0-9-_.]{0,62}[a-z0-9])?$/;

const normalizeIdentifier = (value: string, fieldName: 'appId' | 'clientId'): string => {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  if (normalized.length > MAX_IDENTIFIER_LENGTH) {
    throw new Error(`${fieldName} must be at most ${MAX_IDENTIFIER_LENGTH} characters`);
  }

  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error(
      `${fieldName} must contain only lowercase letters, numbers, hyphens, underscores, or periods`,
    );
  }

  return normalized;
};

export const normalizeAuthRequest = (body: AuthRequestBody): AuthRequestBody => ({
  appId: normalizeIdentifier(body.appId, 'appId'),
  clientId: normalizeIdentifier(body.clientId, 'clientId'),
  modelAllowlist: body.modelAllowlist,
});

export interface AuthSuccessResponse {
  token: string;
  expiresAt: string;
  issuedAt: string;
}

export interface AiRequestBody {
  provider?: string;
  model?: string;
  input: string;
  stream?: boolean;
  maxOutputTokens?: number;
}

export interface AiSuccessResponse {
  provider: string;
  model: string;
  output: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface NormalizedErrorResponse {
  error: {
    code: string;
    category: 'validation' | 'authentication' | 'policy' | 'rate_limit' | 'upstream' | 'internal';
    message: string;
    requestId: string;
    actionable?: {
      summary: string;
      details?: readonly string[];
    };
  };
}
