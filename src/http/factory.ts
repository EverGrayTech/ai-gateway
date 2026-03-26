import { HmacTokenSigner } from '../auth/token.js';
import { loadGatewayConfig } from '../config/env.js';
import type { GatewayConfig } from '../contracts/config.js';
import type { RequestContext } from '../contracts/context.js';
import type { Logger } from '../observability/logger.js';
import { createLogger } from '../observability/logger.js';
import { AnthropicProviderExecutor } from '../providers/anthropic.js';
import { GeminiProviderExecutor } from '../providers/gemini.js';
import { OpenAiProviderExecutor } from '../providers/openai.js';
import { OpenRouterProviderExecutor } from '../providers/openrouter.js';
import {
  ExternalRateLimiter,
  MemoryRateLimiterStore,
  NoopRateLimiter,
  NoopTelemetry,
  StubProviderExecutor,
} from '../runtime/adapters.js';
import type { ProviderExecutorPort, RateLimiterPort, TelemetryPort } from '../runtime/ports.js';
import { GatewayService } from '../runtime/service.js';

class CompositeProviderExecutor implements ProviderExecutorPort {
  readonly #executors: readonly ProviderExecutorPort[];

  public constructor(executors: readonly ProviderExecutorPort[]) {
    this.#executors = executors;
  }

  public async execute(input: {
    provider: string;
    model: string;
    prompt: string;
    stream: boolean;
    maxOutputTokens: number;
    context: RequestContext;
  }): Promise<{
    output: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    stream?: AsyncIterable<{ event?: string; data: string }>;
  }> {
    for (const executor of this.#executors) {
      try {
        return await executor.execute(input);
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as { code?: string }).code === 'PROVIDER_MISMATCH'
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new Error(`No provider executor available for provider: ${input.provider}`);
  }
}

export interface CreateGatewayServiceOptions {
  config?: GatewayConfig;
  logger?: Logger;
  rateLimiter?: RateLimiterPort;
  telemetry?: TelemetryPort;
  providerExecutor?: ProviderExecutorPort;
}

const createRateLimiter = (config: GatewayConfig): RateLimiterPort => {
  if (config.adapters.rateLimiter === 'external') {
    return new ExternalRateLimiter({
      store: new MemoryRateLimiterStore(),
      failOpen: config.environment !== 'production',
    });
  }

  if (config.environment === 'production') {
    throw new Error('Production requires an external rate limiter backend');
  }

  return new NoopRateLimiter();
};

export const createGatewayService = (options: CreateGatewayServiceOptions = {}): GatewayService => {
  const config = options.config ?? loadGatewayConfig();
  const logger = options.logger ?? createLogger();

  return new GatewayService({
    config,
    logger,
    rateLimiter: options.rateLimiter ?? createRateLimiter(config),
    telemetry: options.telemetry ?? new NoopTelemetry(),
    providerExecutor:
      options.providerExecutor ??
      new CompositeProviderExecutor([
        new OpenAiProviderExecutor({
          credentials: config.providerCredentials.openai,
        }),
        new AnthropicProviderExecutor(),
        new GeminiProviderExecutor(),
        new OpenRouterProviderExecutor(),
      ]),
    tokenSigner: new HmacTokenSigner(config.signingSecret),
  });
};
