import { describe, expect, it } from 'vitest';
import { redactFields } from '../../src/index.js';

describe('observability redaction', () => {
  it('redacts sensitive fields before logging or telemetry', () => {
    expect(
      redactFields({
        authorization: 'Bearer secret',
        token: 'abc',
        'x-eg-ai-provider-credential': 'provider-secret',
        prompt: 'hello',
        clientId: 'client',
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      token: '[REDACTED]',
      'x-eg-ai-provider-credential': '[REDACTED]',
      prompt: '[REDACTED]',
      clientId: 'client',
    });
  });
});
