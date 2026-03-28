import { createServerlessHandler } from '../src/serverless/adapter.js';

export const runtime = 'edge';

const handler = createServerlessHandler();

export default async function handleRequest(request: Request): Promise<Response> {
  return handler(request);
}
