import type { NormalizedErrorResponse } from '../contracts/api.js';
import type { RequestContext } from '../contracts/context.js';
import { internalError } from './factories.js';
import { GatewayError } from './gateway-error.js';

const buildActionableDiagnostics = (gatewayError: GatewayError): NormalizedErrorResponse['error']['actionable'] => {
  switch (gatewayError.code) {
    case 'INVALID_JSON_BODY':
      return {
        summary: 'The request body could not be parsed as JSON.',
        details: [
          'Ensure the request body is valid JSON with double-quoted property names and string values.',
          'Ensure the Content-Type header is application/json.',
          'PowerShell curl.exe commonly strips inner double quotes when single-quoted JSON is passed directly to -d.',
          'If the body preview resembles {appId:web,clientId:test-client-1} instead of valid JSON, the shell invocation is rewriting the payload before it reaches the server.',
          'If the body preview resembles only {\\ or another truncated prefix, PowerShell escaping is still breaking the curl arguments before transmission.',
          'On Windows PowerShell, prefer Invoke-RestMethod / Invoke-WebRequest with a JSON string created by ConvertTo-Json, or invoke curl from cmd.exe/bash.',
        ],
      };
    case 'MISSING_REQUEST_BODY':
      return {
        summary: 'The request body was empty or missing.',
        details: [
          'Send a non-empty JSON body.',
          'Confirm the client actually transmitted the payload and Content-Length is non-zero.',
        ],
      };
    case 'ROUTE_NOT_FOUND':
      return {
        summary: 'The request path did not match a supported gateway route.',
        details: [
          'Supported hosted routes are POST /auth and POST /ai.',
          'If deployed behind a platform prefix such as /api, normalize the path before gateway routing.',
        ],
      };
    case 'MISSING_BEARER_TOKEN':
      return {
        summary: 'The AI request did not include a bearer token.',
        details: ['Obtain a token from /auth and send it as Authorization: Bearer <token>.'],
      };
    case 'INVALID_BEARER_TOKEN':
      return {
        summary: 'The bearer token could not be verified.',
        details: [
          'Ensure the token was minted by this gateway deployment.',
          'Check token expiration and signing secret consistency across environments.',
        ],
      };
    case 'RATE_LIMIT_BACKEND_UNAVAILABLE':
      return {
        summary: 'The external rate-limiting backend could not be reached or returned an unusable response.',
        details: [
          'Verify that production rate-limiter configuration is present and correctly trimmed.',
          'If using Upstash, verify UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in the deployed environment.',
          'If the surfaced URL appears quoted (for example "https://..."/pipeline), the deployed URL value likely includes stray quote characters and should be corrected or trimmed.',
          'Check whether the backend returned a non-200 response, invalid payload shape, or authentication failure.',
          'Use the requestId to correlate logs and inspect the backend-specific detail included in the error message.',
        ],
      };
    default:
      return {
        summary:
          gatewayError.category === 'internal'
            ? 'An internal failure occurred. Use the requestId to correlate server-side logs.'
            : 'The request failed server-side. Use the error code and requestId to continue debugging.',
      };
  }
};

export const toGatewayError = (error: unknown): GatewayError => {
  if (error instanceof GatewayError) {
    return error;
  }

  return internalError(undefined, error);
};

export const normalizeErrorResponse = (
  error: unknown,
  context: RequestContext,
): { status: number; body: NormalizedErrorResponse } => {
  const gatewayError = toGatewayError(error);
  const safeMessage = gatewayError.exposeMessage ? gatewayError.message : 'Internal server error';

  return {
    status: gatewayError.status,
    body: {
      error: {
        code: gatewayError.code,
        category: gatewayError.category,
        message: safeMessage,
        requestId: context.runtime.requestId,
        actionable: buildActionableDiagnostics(gatewayError),
      },
    },
  };
};
