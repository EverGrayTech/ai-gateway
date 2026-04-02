import type { RequestContext } from '../contracts/context.js';
import type { GatewayHttpRequest } from '../contracts/http.js';
import { upstreamError } from '../errors/factories.js';
import type {
  ProviderExecutorPort,
  RateLimitDescriptor,
  RateLimitResult,
  RateLimiterPort,
  TelemetryPort,
  TelemetryRecord,
} from './ports.js';

export interface ExternalRateLimiterStore {
  increment(
    key: string,
    windowSeconds: number,
  ): Promise<{ count: number; expiresInSeconds: number }>;
}

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

export class MemoryRateLimiterStore implements ExternalRateLimiterStore {
  readonly #counts = new Map<string, { count: number; resetAt: number }>();

  public async increment(
    key: string,
    windowSeconds: number,
  ): Promise<{ count: number; expiresInSeconds: number }> {
    const now = Date.now();
    const existing = this.#counts.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowSeconds * 1000;
      this.#counts.set(key, { count: 1, resetAt });
      return { count: 1, expiresInSeconds: windowSeconds };
    }

    existing.count += 1;
    return {
      count: existing.count,
      expiresInSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
}

export class UpstashRateLimiterStore implements ExternalRateLimiterStore {
  readonly #url: string;
  readonly #token: string;

  public constructor(options: { url: string; token: string }) {
    this.#url = options.url.trim().replace(/^"|"$/g, '').replace(/\/$/, '');
    this.#token = options.token;
  }

  public async increment(
    key: string,
    windowSeconds: number,
  ): Promise<{ count: number; expiresInSeconds: number }> {
    const pipelineUrl = `${this.#url}/pipeline`;
    const response = await fetch(pipelineUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.#token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, windowSeconds, 'NX'],
        ['TTL', key],
      ]),
    });

    if (!response.ok) {
      throw new Error(`Upstash rate limiter request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as Array<{ result?: unknown; error?: string }>;

    if (!Array.isArray(payload) || payload.length < 3) {
      throw new Error('Upstash rate limiter returned an unexpected response shape');
    }

    for (const entry of payload) {
      if (entry?.error) {
        throw new Error(`Upstash rate limiter error: ${entry.error}`);
      }
    }

    const count = Number(payload[0]?.result);
    const ttl = Number(payload[2]?.result);

    if (!Number.isFinite(count) || count <= 0) {
      throw new Error('Upstash rate limiter returned an invalid counter value');
    }

    return {
      count,
      expiresInSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : windowSeconds,
    };
  }
}

export class ExternalRateLimiter implements RateLimiterPort {
  readonly #store: ExternalRateLimiterStore;
  readonly #failOpen: boolean;

  public constructor(options: { store: ExternalRateLimiterStore; failOpen?: boolean }) {
    this.#store = options.store;
    this.#failOpen = options.failOpen ?? false;
  }

  public async check(
    descriptor: RateLimitDescriptor,
    _context: RequestContext,
    _request: GatewayHttpRequest,
  ): Promise<RateLimitResult> {
    try {
      const result = await this.#store.increment(descriptor.key, descriptor.windowSeconds);

      if (result.count > descriptor.limit) {
        return {
          allowed: false,
          retryAfterSeconds: result.expiresInSeconds,
          remaining: 0,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, descriptor.limit - result.count),
      };
    } catch (error) {
      if (this.#failOpen) {
        return { allowed: true };
      }

      const detail =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : `Non-Error throw: ${String(error)}`;

      throw upstreamError(
        `Rate limiting backend is unavailable (${detail})`,
        'upstream-provider-failed',
        error,
        { reason: 'rate_limit_backend_unavailable' },
      );
    }
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
  }): Promise<{
    output: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    stream?: AsyncIterable<{ event?: string; data: string }>;
  }> {
    const output = `stub:${input.provider}:${input.model}:${input.maxOutputTokens}:${input.prompt}`;
    return {
      output,
      usage: {
        inputTokens: Math.ceil(input.prompt.length / 4),
        outputTokens: Math.ceil(output.length / 4),
        totalTokens: Math.ceil(input.prompt.length / 4) + Math.ceil(output.length / 4),
      },
      stream: input.stream
        ? (async function* () {
            yield { event: 'message', data: output };
          })()
        : undefined,
    };
  }
}
