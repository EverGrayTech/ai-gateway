import { HmacTokenSigner } from '../auth/token.js';
import { loadGatewayConfig } from '../config/env.js';
import type { GatewayConfig } from '../contracts/config.js';
import type { Logger } from '../observability/logger.js';
import { createLogger } from '../observability/logger.js';
import { OpenAiProviderExecutor } from '../providers/openai.js';
import { NoopRateLimiter, NoopTelemetry, StubProviderExecutor } from '../runtime/adapters.js';
import type { ProviderExecutorPort, RateLimiterPort, TelemetryPort } from '../runtime/ports.js';
import { GatewayService } from '../runtime/service.js';

export interface CreateGatewayServiceOptions {
  config?: GatewayConfig;
  logger?: Logger;
  rateLimiter?: RateLimiterPort;
  telemetry?: TelemetryPort;
  providerExecutor?: ProviderExecutorPort;
}

export const createGatewayService = (options: CreateGatewayServiceOptions = {}): GatewayService => {
  const config = options.config ?? loadGatewayConfig();
  const logger = options.logger ?? createLogger();

  return new GatewayService({
    config,
    logger,
    rateLimiter: options.rateLimiter ?? new NoopRateLimiter(),
    telemetry: options.telemetry ?? new NoopTelemetry(),
    providerExecutor: options.providerExecutor ?? new OpenAiProviderExecutor(),
    tokenSigner: new HmacTokenSigner(config.signingSecret),
  });
};
