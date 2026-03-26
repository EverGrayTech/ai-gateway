export interface AuthRequestBody {
  appId: string;
  clientId: string;
  modelAllowlist?: readonly string[];
}

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
  };
}
