export type HeaderValue = string | readonly string[];

export interface GatewayHttpRequest {
  method: string;
  path: string;
  headers: Readonly<Record<string, HeaderValue | undefined>>;
  query?: Readonly<Record<string, string | undefined>>;
  body?: string;
  remoteAddress?: string;
}

export interface GatewayHttpResponse {
  status: number;
  headers?: Readonly<Record<string, string>>;
  body: string;
}

export interface GatewayStreamChunk {
  event?: string;
  data: string;
}

export interface GatewayStreamResponse {
  status: number;
  headers?: Readonly<Record<string, string>>;
  stream: AsyncIterable<GatewayStreamChunk>;
}

export type GatewayHandlerResult =
  | {
      kind: 'response';
      response: GatewayHttpResponse;
    }
  | {
      kind: 'stream';
      response: GatewayStreamResponse;
    };
