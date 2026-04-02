import type { GatewayConfig } from '../contracts/config.js';
import type { ProviderModelMetadata } from '../contracts/provider.js';

export const SUPPORTED_PROVIDER_MODELS = {
  openai: ['gpt-4o-mini'],
  anthropic: ['claude-3-5-haiku-latest'],
  gemini: ['gemini-2.0-flash'],
  openrouter: ['openai/gpt-4o-mini'],
} as const satisfies Record<string, readonly string[]>;

export const getSupportedProviderNames = (): string[] => Object.keys(SUPPORTED_PROVIDER_MODELS);

export const isSupportedProvider = (provider: string): boolean =>
  getSupportedProviderNames().includes(provider);

export const getSupportedModelsForProvider = (provider: string): readonly string[] =>
  SUPPORTED_PROVIDER_MODELS[provider as keyof typeof SUPPORTED_PROVIDER_MODELS] ?? [];

export const createProviderMetadata = (
  provider: keyof typeof SUPPORTED_PROVIDER_MODELS,
  supportsStreaming = true,
): readonly ProviderModelMetadata[] =>
  SUPPORTED_PROVIDER_MODELS[provider].map((model) => ({
    provider,
    model,
    supportsStreaming,
  }));

export const createAllowedModelsByProvider = (config: GatewayConfig): Record<string, string[]> => {
  const allowedModelsByProvider: Record<string, string[]> = {};

  for (const provider of Object.keys(config.providerCredentials)) {
    const supportedModels = getSupportedModelsForProvider(provider);
    if (supportedModels.length > 0) {
      allowedModelsByProvider[provider] = [...supportedModels];
    }
  }

  if (!(config.defaults.defaultProvider in allowedModelsByProvider)) {
    const fallbackModels = getSupportedModelsForProvider(config.defaults.defaultProvider);
    if (fallbackModels.length > 0) {
      allowedModelsByProvider[config.defaults.defaultProvider] = [...fallbackModels];
    }
  }

  return allowedModelsByProvider;
};
