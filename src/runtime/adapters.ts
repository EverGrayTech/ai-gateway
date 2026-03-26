import type { RequestContext } from '../contracts/context.js';
import type { GatewayHttpRequest } from '../contracts/http.js';
import type {
  ProviderExecutorPort,
  RateLimitResult,
  RateLimiterPort,
  TelemetryPort,
} from './ports.js';

export class NoopRateLimiter implements RateLimiterPort {
  public async check(
    _context: RequestContext,
    _request: GatewayHttpRequest,
  ): Promise<RateLimitResult> {
    return { allowed: true };
  }
}

export class NoopTelemetry implements TelemetryPort {
  public async record(_event: string, _fields: Readonly<Record<string, unknown>>): Promise<void> {}
}

export class StubProviderExecutor implements ProviderExecutorPort {
  public async execute(input: {
    provider: string;
    model: string;
    prompt: string;
    stream: boolean;
    maxOutputTokens: number;
    context: RequestContext;
  }): Promise<{ output: string }> {
    return {
      output: `stub:${input.provider}:${input.model}:${input.maxOutputTokens}:${input.prompt}`,
    };
  }
}
