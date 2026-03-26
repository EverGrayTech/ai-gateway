export interface GatewayPolicy {
  allowedProviders: readonly string[];
  allowedModelsByProvider: Readonly<Record<string, readonly string[]>>;
  defaultProvider: string;
  defaultModel: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  appOverrides?: Readonly<
    Record<
      string,
      {
        allowedProviders?: readonly string[];
        allowedModelsByProvider?: Readonly<Record<string, readonly string[]>>;
        defaultProvider?: string;
        defaultModel?: string;
        maxInputTokens?: number;
        maxOutputTokens?: number;
      }
    >
  >;
}

export interface EffectiveGatewayPolicy {
  allowedProviders: readonly string[];
  allowedModelsByProvider: Readonly<Record<string, readonly string[]>>;
  defaultProvider: string;
  defaultModel: string;
  maxInputTokens: number;
  maxOutputTokens: number;
}

export interface NormalizedAiRequest {
  provider: string;
  model: string;
  input: string;
  stream: boolean;
  maxOutputTokens?: number;
}

export interface ProviderExecutionIntent {
  provider: string;
  model: string;
  prompt: string;
  stream: boolean;
  maxOutputTokens: number;
}
