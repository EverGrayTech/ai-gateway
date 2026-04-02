import type { GatewayTokenClaims } from '../auth/token.js';
import type { AiRequestBody } from '../contracts/api.js';
import type { GatewayConfig } from '../contracts/config.js';
import type {
  ResolvedAiRequestShape,
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

export const resolveAiRequestShape = (
  request: NormalizedAiRequest,
  providerCredential?: string,
): ResolvedAiRequestShape => {
  const hasProvider = request.provider.length > 0;
  const hasModel = request.model.length > 0;
  const normalizedCredential = providerCredential?.trim() || '';
  const hasCredential = normalizedCredential.length > 0;

  if (!hasProvider && !hasModel && !hasCredential) {
    return {
      kind: 'hosted-default',
      provider: '',
      model: '',
      input: request.input,
      stream: request.stream,
      maxOutputTokens: request.maxOutputTokens,
    };
  }

  if (hasProvider && hasModel && hasCredential) {
    return {
      kind: 'explicit-byok',
      provider: request.provider,
      model: request.model,
      input: request.input,
      stream: request.stream,
      maxOutputTokens: request.maxOutputTokens,
      providerCredential: normalizedCredential,
    };
  }

  const details = {
    providerPresent: hasProvider,
    modelPresent: hasModel,
    credentialPresent: hasCredential,
  };

  if (hasProvider && !hasModel && !hasCredential) {
    throw validationError('provider requires model and provider credential.', 'request-invalid-shape', {
      reason: 'provider_requires_model_and_credential',
      ...details,
    });
  }

  if (!hasProvider && hasModel && !hasCredential) {
    throw validationError('model requires provider and provider credential.', 'request-invalid-shape', {
      reason: 'model_requires_provider_and_credential',
      ...details,
    });
  }

  if (!hasProvider && !hasModel && hasCredential) {
    throw validationError('provider credential requires provider and model.', 'request-invalid-shape', {
      reason: 'credential_requires_provider_and_model',
      ...details,
    });
  }

  if (hasProvider && hasModel && !hasCredential) {
    throw validationError('provider and model require provider credential.', 'request-invalid-shape', {
      reason: 'provider_model_require_credential',
      ...details,
    });
  }

  if (hasProvider && !hasModel && hasCredential) {
    throw validationError('provider and provider credential require model.', 'request-invalid-shape', {
      reason: 'provider_credential_require_model',
      ...details,
    });
  }

  throw validationError('model and provider credential require provider.', 'request-invalid-shape', {
    reason: 'model_credential_require_provider',
    ...details,
  });
};

export const evaluateByokExecutionIntent = (
  request: ResolvedAiRequestShape,
  effectivePolicy: EffectiveGatewayPolicy,
): ProviderExecutionIntent => {
  if (request.kind !== 'explicit-byok') {
    throw validationError('BYOK execution requires explicit provider, model, and provider credential.');
  }

  const supportedModels = getSupportedModelsForProvider(request.provider);
  if (supportedModels.length === 0) {
    throw validationError(`Unsupported provider "${request.provider}".`, 'request-invalid', {
      provider: request.provider,
      reason: 'provider_not_supported',
    });
  }

  if (!supportedModels.includes(request.model)) {
    throw validationError(
      `Requested model "${request.model}" is not supported by provider "${request.provider}".`,
      'request-invalid',
      {
        provider: request.provider,
        model: request.model,
        reason: 'model_not_supported_by_provider',
      },
    );
  }

  const requestedInputTokens = countApproximateTokens(request.input);
  if (requestedInputTokens > effectivePolicy.maxInputTokens) {
    throw validationError('Input exceeds allowed size for this route.', 'request-invalid', {
      reason: 'input_too_large',
      limit: effectivePolicy.maxInputTokens,
      requested: requestedInputTokens,
    });
  }

  const maxOutputTokens = Math.min(
    request.maxOutputTokens ?? effectivePolicy.maxOutputTokens,
    effectivePolicy.maxOutputTokens,
  );

  return {
    provider: request.provider,
    model: request.model,
    prompt: request.input,
    stream: request.stream,
    maxOutputTokens,
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
