export type GatewayErrorCategory =
  | 'validation'
  | 'authentication'
  | 'policy'
  | 'rate_limit'
  | 'upstream'
  | 'internal';

export interface GatewayErrorOptions {
  code: string;
  category: GatewayErrorCategory;
  message: string;
  status: number;
  cause?: unknown;
  exposeMessage?: boolean;
}

export class GatewayError extends Error {
  readonly code: string;
  readonly category: GatewayErrorCategory;
  readonly status: number;
  readonly exposeMessage: boolean;
  readonly cause?: unknown;

  public constructor(options: GatewayErrorOptions) {
    super(options.message);
    this.name = 'GatewayError';
    this.code = options.code;
    this.category = options.category;
    this.status = options.status;
    this.exposeMessage = options.exposeMessage ?? options.category !== 'internal';
    this.cause = options.cause;
  }
}
