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
import {
  createAllowedModelsByProvider,
  getSupportedModelsForProvider,
} from '../providers/catalog.js';

export const createGatewayPolicy = (config: GatewayConfig): GatewayPolicy => ({
  allowedProviders: Object.keys(createAllowedModelsByProvider(config)).length
    ? Object.keys(createAllowedModelsByProvider(config))
    : [config.defaults.defaultProvider],
  allowedModelsByProvider: createAllowedModelsByProvider(config),
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
    throw validationError('input is required.', 'request-invalid', {
      field: 'input',
      reason: 'missing_input',
    });
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
  if (!request.provider && request.model) {
    throw validationError(
      'model cannot be specified when provider is omitted for the hosted default route.',
      'request-invalid',
      {
        field: 'model',
        reason: 'model_requires_provider',
      },
    );
  }

  const provider = request.provider || effectivePolicy.defaultProvider;
  const model = request.model || effectivePolicy.defaultModel;

  if (!effectivePolicy.allowedProviders.includes(provider)) {
    throw policyError(
      `Requested provider "${provider}" is not allowed for this hosted route.`,
      'policy-provider-not-allowed',
      {
        provider,
        reason: 'provider_not_allowlisted',
      },
    );
  }

  const allowedModels = effectivePolicy.allowedModelsByProvider[provider] ?? [];
  if (!allowedModels.includes(model)) {
    throw policyError(
      `Requested model "${model}" is not allowed for this hosted route.`,
      'policy-model-not-allowed',
      {
        provider,
        model,
        reason: 'model_not_allowlisted',
      },
    );
  }

  const supportedModels = getSupportedModelsForProvider(provider);
  if (!supportedModels.includes(model)) {
    throw policyError(
      `Requested model "${model}" is not supported by provider "${provider}".`,
      'policy-model-not-allowed',
      {
        provider,
        model,
        reason: 'model_not_supported_by_provider',
      },
    );
  }

  const tokenAllowlist = tokenClaims.constraints.modelAllowlist;
  if (tokenAllowlist && !tokenAllowlist.includes(model)) {
    throw policyError(
      `Requested model "${model}" is not permitted by this token.`,
      'policy-model-not-allowed',
      {
        provider,
        model,
        reason: 'model_not_permitted_by_token',
      },
    );
  }

  const requestedInputTokens = countApproximateTokens(request.input);
  const effectiveInputLimit = Math.min(
    tokenClaims.constraints.maxInputTokens,
    effectivePolicy.maxInputTokens,
  );

  if (requestedInputTokens > effectiveInputLimit) {
    throw validationError('Input exceeds allowed size for this hosted route.', 'request-invalid', {
      reason: 'input_too_large',
      limit: effectiveInputLimit,
      requested: requestedInputTokens,
    });
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
