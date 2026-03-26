import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../src/index.js';

describe('observability logger', () => {
  it('writes logger output to the appropriate console methods for each level', () => {
    const output = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const logger = createLogger(output);

    logger.debug('debug message', { traceId: 't1' });
    logger.info('info message');
    logger.warn('warn message', { code: 'WARN' });
    logger.error('error message', { code: 'ERR' });

    expect(output.log).toHaveBeenCalledTimes(2);
    expect(output.warn).toHaveBeenCalledTimes(1);
    expect(output.error).toHaveBeenCalledTimes(1);
    expect(output.log).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ level: 'debug', message: 'debug message', fields: { traceId: 't1' } }),
    );
    expect(output.log).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({ level: 'info', message: 'info message', fields: undefined }),
    );
    expect(output.warn).toHaveBeenCalledWith(
      JSON.stringify({ level: 'warn', message: 'warn message', fields: { code: 'WARN' } }),
    );
    expect(output.error).toHaveBeenCalledWith(
      JSON.stringify({ level: 'error', message: 'error message', fields: { code: 'ERR' } }),
    );
  });
});
