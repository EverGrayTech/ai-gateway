export interface LogFieldValue {
  [key: string]: unknown;
}

export interface LogRecord {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields?: LogFieldValue;
}

export interface Logger {
  debug(message: string, fields?: LogFieldValue): void;
  info(message: string, fields?: LogFieldValue): void;
  warn(message: string, fields?: LogFieldValue): void;
  error(message: string, fields?: LogFieldValue): void;
}

export interface ConsoleLike {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const defaultConsole: ConsoleLike = {
  log: (message) => process.stdout.write(`${message}\n`),
  warn: (message) => process.stderr.write(`${message}\n`),
  error: (message) => process.stderr.write(`${message}\n`),
};

const write = (record: LogRecord, output: ConsoleLike): void => {
  const serialized = JSON.stringify(record);
  switch (record.level) {
    case 'debug':
    case 'info': {
      output.log(serialized);
      break;
    }
    case 'warn': {
      output.warn(serialized);
      break;
    }
    case 'error': {
      output.error(serialized);
      break;
    }
  }
};

export const createLogger = (output: ConsoleLike = defaultConsole): Logger => ({
  debug: (message, fields) => write({ level: 'debug', message, fields }, output),
  info: (message, fields) => write({ level: 'info', message, fields }, output),
  warn: (message, fields) => write({ level: 'warn', message, fields }, output),
  error: (message, fields) => write({ level: 'error', message, fields }, output),
});
