export interface AuthRequestBody {
  appId: string;
  clientId: string;
}

export interface AuthSuccessResponse {
  token: string;
  expiresAt: string;
}

export interface AiRequestBody {
  provider: string;
  model: string;
  input: string;
  stream?: boolean;
}

export interface AiSuccessResponse {
  provider: string;
  model: string;
  output: string;
}

export interface NormalizedErrorResponse {
  error: {
    code: string;
    category: 'validation' | 'authentication' | 'policy' | 'rate_limit' | 'upstream' | 'internal';
    message: string;
    requestId: string;
  };
}
