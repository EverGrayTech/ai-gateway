export type GatewayErrorCategory =
  | 'validation'
  | 'authentication'
  | 'policy'
  | 'rate-limit'
  | 'provider'
  | 'internal';

export type GatewayErrorDetails = Readonly<Record<string, unknown>>;

export interface GatewayErrorOptions {
  code: string;
  category: GatewayErrorCategory;
  message: string;
  status: number;
  retryable?: boolean;
  details?: GatewayErrorDetails;
  cause?: unknown;
  exposeMessage?: boolean;
}

export class GatewayError extends Error {
  readonly code: string;
  readonly category: GatewayErrorCategory;
  readonly status: number;
  readonly exposeMessage: boolean;
  readonly retryable: boolean;
  readonly details?: GatewayErrorDetails;
  readonly cause?: unknown;

  public constructor(options: GatewayErrorOptions) {
    super(options.message);
    this.name = 'GatewayError';
    this.code = options.code;
    this.category = options.category;
    this.status = options.status;
    this.exposeMessage = options.exposeMessage ?? options.category !== 'internal';
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    this.cause = options.cause;
  }
}
