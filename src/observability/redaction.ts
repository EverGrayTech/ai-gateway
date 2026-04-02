const SENSITIVE_KEYS = [
  /token/i,
  /authorization/i,
  /api[-_]?key/i,
  /credential/i,
  /prompt/i,
  /input/i,
];

const isSensitiveKey = (key: string): boolean =>
  SENSITIVE_KEYS.some((pattern) => pattern.test(key));

export const redactFields = (
  fields: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, isSensitiveKey(key) ? '[REDACTED]' : value]),
  );
