import type { GatewayTokenClaims } from '../auth/token.js';
import type { AiRequestBody } from '../contracts/api.js';
import type { GatewayConfig } from '../contracts/config.js';
import type {
  EffectiveGatewayPolicy,
  GatewayPolicy,
  NormalizedAiRequest,
  ProviderExecutionIntent,
} from '../contracts/policy.js';
import { policyError, validationError } from '../errors/factories.js';

export const createGatewayPolicy = (config: GatewayConfig): GatewayPolicy => ({
  allowedProviders: Object.keys(config.providerCredentials).length
    ? Object.keys(config.providerCredentials)
    : [config.defaults.defaultProvider],
  allowedModelsByProvider: {
    [config.defaults.defaultProvider]: [config.defaults.defaultModel],
  },
  defaultProvider: config.defaults.defaultProvider,
  defaultModel: config.defaults.defaultModel,
  maxInputTokens: config.defaults.maxInputTokens,
  maxOutputTokens: config.defaults.maxOutputTokens,
});

export const resolveEffectivePolicy = (
  policy: GatewayPolicy,
  appId: string,
): EffectiveGatewayPolicy => {
  const override = policy.appOverrides?.[appId];

  return {
    allowedProviders: override?.allowedProviders ?? policy.allowedProviders,
    allowedModelsByProvider: override?.allowedModelsByProvider ?? policy.allowedModelsByProvider,
    defaultProvider: override?.defaultProvider ?? policy.defaultProvider,
    defaultModel: override?.defaultModel ?? policy.defaultModel,
    maxInputTokens: Math.min(
      override?.maxInputTokens ?? policy.maxInputTokens,
      policy.maxInputTokens,
    ),
    maxOutputTokens: Math.min(
      override?.maxOutputTokens ?? policy.maxOutputTokens,
      policy.maxOutputTokens,
    ),
  };
};

export const normalizeAiRequest = (body: AiRequestBody): NormalizedAiRequest => {
  const input = body.input?.trim();
  if (!input) {
    throw validationError('input is required', 'MISSING_AI_INPUT');
  }

  return {
    provider: body.provider?.trim() || '',
    model: body.model?.trim() || '',
    input,
    stream: Boolean(body.stream),
    maxOutputTokens: body.maxOutputTokens,
  };
};

export const countApproximateTokens = (input: string): number => Math.ceil(input.length / 4);

export const evaluateExecutionIntent = (
  request: NormalizedAiRequest,
  tokenClaims: GatewayTokenClaims,
  effectivePolicy: EffectiveGatewayPolicy,
): ProviderExecutionIntent => {
  const provider = request.provider || effectivePolicy.defaultProvider;
  const model = request.model || effectivePolicy.defaultModel;

  if (!effectivePolicy.allowedProviders.includes(provider)) {
    throw policyError('Provider is not allowed', 'UNSUPPORTED_PROVIDER');
  }

  const allowedModels = effectivePolicy.allowedModelsByProvider[provider] ?? [];
  if (!allowedModels.includes(model)) {
    throw policyError('Model is not allowed', 'UNSUPPORTED_MODEL');
  }

  const tokenAllowlist = tokenClaims.constraints.modelAllowlist;
  if (tokenAllowlist && !tokenAllowlist.includes(model)) {
    throw policyError('Model is not permitted by token constraints', 'TOKEN_MODEL_RESTRICTED');
  }

  const requestedInputTokens = countApproximateTokens(request.input);
  const effectiveInputLimit = Math.min(
    tokenClaims.constraints.maxInputTokens,
    effectivePolicy.maxInputTokens,
  );

  if (requestedInputTokens > effectiveInputLimit) {
    throw policyError('Input exceeds allowed size', 'INPUT_TOO_LARGE');
  }

  const requestedOutputTokens = request.maxOutputTokens ?? effectivePolicy.maxOutputTokens;
  const tokenOutputLimit = tokenClaims.constraints.maxOutputTokens;
  const effectiveOutputLimit = Math.min(
    requestedOutputTokens,
    effectivePolicy.maxOutputTokens,
    tokenOutputLimit,
  );

  return {
    provider,
    model,
    prompt: request.input,
    stream: request.stream,
    maxOutputTokens: effectiveOutputLimit,
  };
};
