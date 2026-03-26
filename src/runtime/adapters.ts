import type { RequestContext } from '../contracts/context.js';
import type { GatewayHttpRequest } from '../contracts/http.js';
import type {
  ProviderExecutorPort,
  RateLimitDescriptor,
  RateLimitResult,
  RateLimiterPort,
  TelemetryPort,
  TelemetryRecord,
} from './ports.js';

export class NoopRateLimiter implements RateLimiterPort {
  readonly #counts = new Map<string, { count: number; resetAt: number }>();

  public async check(
    descriptor: RateLimitDescriptor,
    _context: RequestContext,
    _request: GatewayHttpRequest,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.#counts.get(descriptor.key);
    if (!existing || existing.resetAt <= now) {
      this.#counts.set(descriptor.key, {
        count: 1,
        resetAt: now + descriptor.windowSeconds * 1000,
      });
      return { allowed: true, remaining: descriptor.limit - 1 };
    }

    if (existing.count >= descriptor.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
        remaining: 0,
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, descriptor.limit - existing.count),
    };
  }
}

export class NoopTelemetry implements TelemetryPort {
  readonly #records: TelemetryRecord[] = [];

  public async record(event: string, fields: Readonly<Record<string, unknown>>): Promise<void> {
    this.#records.push({ event, fields });
  }

  public async flush(): Promise<readonly TelemetryRecord[]> {
    return [...this.#records];
  }
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
