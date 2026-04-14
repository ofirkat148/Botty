import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // In dev, use a minimal readable format; in prod, emit NDJSON for log aggregators
  ...(isDev
    ? {
        transport: {
          target: 'pino/file',
          options: { destination: 1 }, // stdout
        },
      }
    : {}),
  redact: {
    paths: [
      'req.headers.authorization',
      'token',
      'apiKey',
      'encryptedKey',
      'JWT_SECRET',
      'KEY_ENCRYPTION_SECRET',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;
