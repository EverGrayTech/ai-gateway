import type { RequestContext } from '../contracts/context.js';
import type { GatewayHttpRequest } from '../contracts/http.js';

export interface RateLimitDescriptor {
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  remaining?: number;
}

export interface RateLimiterPort {
  check(
    descriptor: RateLimitDescriptor,
    context: RequestContext,
    request: GatewayHttpRequest,
  ): Promise<RateLimitResult>;
}

export interface TelemetryRecord {
  event: string;
  fields: Readonly<Record<string, unknown>>;
}

export interface TelemetryPort {
  record(event: string, fields: Readonly<Record<string, unknown>>): Promise<void>;
  flush?(): Promise<readonly TelemetryRecord[]>;
}

export interface ProviderExecutorPort {
  execute(input: {
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
    stream?: AsyncIterable<{
      event?: string;
      data: string;
    }>;
  }>;
}
