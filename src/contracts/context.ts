export interface RequestIdentityContext {
  appId: string;
  clientId: string;
}

export interface NetworkContext {
  ip?: string;
  userAgent?: string;
  forwardedFor?: readonly string[];
}

export interface RuntimeMetadata {
  requestId: string;
  receivedAt: string;
  environment: string;
  region?: string;
}

export interface TracingContext {
  correlationId: string;
  traceId?: string;
}

export interface RequestContext {
  identity: RequestIdentityContext;
  network: NetworkContext;
  runtime: RuntimeMetadata;
  tracing: TracingContext;
}
