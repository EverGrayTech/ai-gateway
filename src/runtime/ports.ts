import type { RequestContext } from '../contracts/context.js';
import type { GatewayHttpRequest } from '../contracts/http.js';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface RateLimiterPort {
  check(context: RequestContext, request: GatewayHttpRequest): Promise<RateLimitResult>;
}

export interface TelemetryPort {
  record(event: string, fields: Readonly<Record<string, unknown>>): Promise<void>;
}

export interface ProviderExecutorPort {
  execute(input: {
    provider: string;
    model: string;
    prompt: string;
    stream: boolean;
    maxOutputTokens: number;
    context: RequestContext;
  }): Promise<{ output: string }>;
}
