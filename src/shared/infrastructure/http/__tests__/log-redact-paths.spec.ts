import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { LOG_REDACT_PATHS } from '@/shared/infrastructure/http/log-redact-paths';

const logLine = (record: object): string => {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, done) {
      output += String(chunk);
      done();
    },
  });
  pino({ redact: LOG_REDACT_PATHS }, stream).info(record);

  return output;
};

describe('LOG_REDACT_PATHS', () => {
  it('should redact the authorization and cookie headers when a request is logged', () => {
    const AUTHORIZATION = 'Bearer secret-token';
    const COOKIE = 'session=secret-cookie';
    const SET_COOKIE = 'session=secret-set-cookie';

    const line = logLine({
      req: {
        headers: {
          authorization: AUTHORIZATION,
          cookie: COOKIE,
          'x-user-id': '1',
        },
      },
      res: { headers: { 'set-cookie': SET_COOKIE } },
    });

    expect(line).not.toContain(AUTHORIZATION);
    expect(line).not.toContain(COOKIE);
    expect(line).not.toContain(SET_COOKIE);
    expect(line).toContain('"x-user-id":"1"');
  });
});
