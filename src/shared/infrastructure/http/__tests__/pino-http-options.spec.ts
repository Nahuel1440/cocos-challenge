import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import { pinoHttp } from 'pino-http';
import { describe, expect, it } from 'vitest';
import { buildPinoHttpOptions } from '@/shared/infrastructure/http/pino-http-options';

const loggedRequest = async (headers: Record<string, string>) => {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, done) {
      output += String(chunk);
      done();
    },
  });
  const log = pinoHttp(buildPinoHttpOptions('production'), stream);
  const server = createServer((req, res) => {
    log(req, res);
    res.setHeader('Set-Cookie', 'session=secret-set-cookie');
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  await fetch(`http://127.0.0.1:${port}/`, { headers });
  await new Promise((resolve) => server.close(resolve));

  return output;
};

describe('request logging', () => {
  it('should redact the authorization and cookie headers when a request is logged', async () => {
    const AUTHORIZATION = 'Bearer secret-token';
    const COOKIE = 'session=secret-cookie';
    const SET_COOKIE = 'secret-set-cookie';

    const line = await loggedRequest({
      Authorization: AUTHORIZATION,
      Cookie: COOKIE,
      'X-User-Id': '1',
    });

    expect(line).not.toContain(AUTHORIZATION);
    expect(line).not.toContain(COOKIE);
    expect(line).not.toContain(SET_COOKIE);
    expect(line).toContain('"x-user-id":"1"');
  });
});
