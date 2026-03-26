export interface ProviderModelMetadata {
  provider: string;
  model: string;
  supportsStreaming: boolean;
}

export interface NormalizedProviderSuccess {
  provider: string;
  model: string;
  output: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface NormalizedProviderError {
  code: string;
  message: string;
  retryable: boolean;
}
