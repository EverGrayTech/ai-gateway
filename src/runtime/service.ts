import type { GatewayConfig } from '../contracts/config.js';
import type { RequestContext } from '../contracts/context.js';
import type {
  GatewayHandlerResult,
  GatewayHttpRequest,
  GatewayHttpResponse,
  GatewayStreamChunk,
} from '../contracts/http.js';
import { authenticationError, rateLimitError, validationError } from '../errors/factories.js';
import { normalizeErrorResponse } from '../errors/normalize.js';
import type { Logger } from '../observability/logger.js';
import { startRequestTimer, summarizeRequestContext } from '../observability/request.js';
import { createRequestContext } from './context.js';
import type { ProviderExecutorPort, RateLimiterPort, TelemetryPort } from './ports.js';

const textEncoder = new TextEncoder();

const encodeBase64Url = (value: string): string => {
  const bytes = textEncoder.encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
};

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
};

export interface GatewayServiceDependencies {
  config: GatewayConfig;
  logger: Logger;
  rateLimiter: RateLimiterPort;
  telemetry: TelemetryPort;
  providerExecutor: ProviderExecutorPort;
}

const jsonResponse = (status: number, body: unknown): GatewayHttpResponse => ({
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
  },
  body: JSON.stringify(body),
});

const parseJsonBody = <T>(request: GatewayHttpRequest): T => {
  if (!request.body) {
    throw validationError('Request body is required', 'MISSING_REQUEST_BODY');
  }

  try {
    return JSON.parse(request.body) as T;
  } catch (error) {
    throw validationError('Request body must be valid JSON', 'INVALID_JSON_BODY');
  }
};

const streamOutput = async function* (output: string): AsyncIterable<GatewayStreamChunk> {
  yield { event: 'message', data: output };
};

export class GatewayService {
  readonly #dependencies: GatewayServiceDependencies;

  public constructor(dependencies: GatewayServiceDependencies) {
    this.#dependencies = dependencies;
  }

  public async handle(request: GatewayHttpRequest): Promise<GatewayHandlerResult> {
    const timer = startRequestTimer();
    let context: RequestContext | undefined;

    try {
      const result = await this.routeRequest(request, (nextContext) => {
        context = nextContext;
      });

      if (context) {
        await this.#dependencies.telemetry.record('request.completed', {
          ...summarizeRequestContext(context),
          path: request.path,
          method: request.method,
          durationMs: timer.stop(),
          outcome: 'success',
        });
      }

      return result;
    } catch (error) {
      const fallbackContext =
        context ??
        createRequestContext(request, this.#dependencies.config, {
          appId: 'unknown-app',
          clientId: 'unknown-client',
        });
      const normalized = normalizeErrorResponse(error, fallbackContext);

      this.#dependencies.logger.error('Request failed', {
        ...summarizeRequestContext(fallbackContext),
        path: request.path,
        method: request.method,
        status: normalized.status,
        error: normalized.body.error.code,
      });

      await this.#dependencies.telemetry.record('request.failed', {
        ...summarizeRequestContext(fallbackContext),
        path: request.path,
        method: request.method,
        durationMs: timer.stop(),
        outcome: 'error',
        errorCategory: normalized.body.error.category,
      });

      return {
        kind: 'response',
        response: jsonResponse(normalized.status, normalized.body),
      };
    }
  }

  private async routeRequest(
    request: GatewayHttpRequest,
    setContext: (context: RequestContext) => void,
  ): Promise<GatewayHandlerResult> {
    if (request.method === 'POST' && request.path === '/auth') {
      return this.handleAuth(request, setContext);
    }

    if (request.method === 'POST' && request.path === '/ai') {
      return this.handleAi(request, setContext);
    }

    throw validationError(
      `Unsupported route: ${request.method} ${request.path}`,
      'ROUTE_NOT_FOUND',
    );
  }

  private async handleAuth(
    request: GatewayHttpRequest,
    setContext: (context: RequestContext) => void,
  ): Promise<GatewayHandlerResult> {
    const body = parseJsonBody<{ appId?: string; clientId?: string }>(request);
    const context = createRequestContext(request, this.#dependencies.config, body);
    setContext(context);

    await this.enforceRateLimit(context, request);

    const expiresAt = new Date(
      Date.now() + this.#dependencies.config.defaults.tokenTtlSeconds * 1000,
    ).toISOString();
    const token = encodeBase64Url(
      JSON.stringify({
        appId: context.identity.appId,
        clientId: context.identity.clientId,
        exp: expiresAt,
      }),
    );

    return {
      kind: 'response',
      response: jsonResponse(200, { token, expiresAt }),
    };
  }

  private async handleAi(
    request: GatewayHttpRequest,
    setContext: (context: RequestContext) => void,
  ): Promise<GatewayHandlerResult> {
    const authHeader = Object.entries(request.headers).find(
      ([name]) => name.toLowerCase() === 'authorization',
    )?.[1];
    const authorization = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (!authorization?.startsWith('Bearer ')) {
      throw authenticationError('Bearer token is required', 'MISSING_BEARER_TOKEN');
    }

    let identity: { appId?: string; clientId?: string };
    try {
      identity = JSON.parse(decodeBase64Url(authorization.slice('Bearer '.length))) as {
        appId?: string;
        clientId?: string;
      };
    } catch {
      throw authenticationError('Bearer token is malformed', 'INVALID_BEARER_TOKEN');
    }

    const context = createRequestContext(request, this.#dependencies.config, identity);
    setContext(context);

    await this.enforceRateLimit(context, request);

    const body = parseJsonBody<{
      provider?: string;
      model?: string;
      input?: string;
      stream?: boolean;
    }>(request);

    const provider = body.provider?.trim() || this.#dependencies.config.defaults.defaultProvider;
    const model = body.model?.trim() || this.#dependencies.config.defaults.defaultModel;
    const input = body.input?.trim();
    if (!input) {
      throw validationError('input is required', 'MISSING_AI_INPUT');
    }

    const execution = await this.#dependencies.providerExecutor.execute({
      provider,
      model,
      prompt: input,
      stream: Boolean(body.stream),
      context,
    });

    if (body.stream) {
      return {
        kind: 'stream',
        response: {
          status: 200,
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
          },
          stream: streamOutput(execution.output),
        },
      };
    }

    return {
      kind: 'response',
      response: jsonResponse(200, {
        provider,
        model,
        output: execution.output,
      }),
    };
  }

  private async enforceRateLimit(
    context: RequestContext,
    request: GatewayHttpRequest,
  ): Promise<void> {
    const result = await this.#dependencies.rateLimiter.check(context, request);

    if (!result.allowed) {
      throw rateLimitError(
        result.retryAfterSeconds
          ? `Retry after ${result.retryAfterSeconds} seconds`
          : 'Rate limit exceeded',
      );
    }
  }
}
