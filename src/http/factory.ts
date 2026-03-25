import { loadGatewayConfig } from '../config/env.js';
import type { GatewayConfig } from '../contracts/config.js';
import type { Logger } from '../observability/logger.js';
import { createLogger } from '../observability/logger.js';
import { NoopRateLimiter, NoopTelemetry, StubProviderExecutor } from '../runtime/adapters.js';
import { GatewayService } from '../runtime/service.js';

export interface CreateGatewayServiceOptions {
  config?: GatewayConfig;
  logger?: Logger;
}

export const createGatewayService = (options: CreateGatewayServiceOptions = {}): GatewayService => {
  const config = options.config ?? loadGatewayConfig();
  const logger = options.logger ?? createLogger();

  return new GatewayService({
    config,
    logger,
    rateLimiter: new NoopRateLimiter(),
    telemetry: new NoopTelemetry(),
    providerExecutor: new StubProviderExecutor(),
  });
};
