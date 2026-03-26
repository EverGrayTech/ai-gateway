import { describe, expect, it } from 'vitest';
import { NoopTelemetry } from '../../src/index.js';

describe('observability noop telemetry', () => {
  it('records and flushes telemetry events', async () => {
    const telemetry = new NoopTelemetry();
    await telemetry.record('test.event', { ok: true, appId: 'app' });
    expect(await telemetry.flush()).toEqual([
      {
        event: 'test.event',
        fields: { ok: true, appId: 'app' },
      },
    ]);
  });
});
