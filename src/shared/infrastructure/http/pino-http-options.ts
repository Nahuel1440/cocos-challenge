import { randomUUID } from 'node:crypto';
import type { Options } from 'pino-http';
import { LOG_REDACT_PATHS } from '@/shared/infrastructure/http/log-redact-paths';

export function buildPinoHttpOptions(env: string | undefined): Options {
  return {
    // Our own id per request; an incoming X-Request-Id is ignored.
    genReqId: (_req, res) => {
      const id = randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    redact: LOG_REDACT_PATHS,
    level: env === 'test' ? 'silent' : 'info',
    transport:
      env === 'production' || env === 'test'
        ? undefined
        : { target: 'pino-pretty' },
  };
}
