import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

const BUILT_MAIN = path.join(process.cwd(), 'dist', 'main.js');
const STARTUP_LIMIT_MS = 20000;
const LOG_LIMIT_MS = 5000;
const POLL_INTERVAL_MS = 50;
const AUTHORIZATION = 'Bearer secret-token';
const COOKIE = 'session=secret-cookie';

const freePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
};

const waitUntil = async (condition: () => boolean, limitMs: number) => {
  const deadline = Date.now() + limitMs;
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return condition();
};

describe('built application', () => {
  let child: ChildProcess;
  let output = '';
  let port: number;

  beforeAll(async () => {
    if (!existsSync(BUILT_MAIN)) {
      throw new Error('dist/main.js is missing: run `npm run build` first');
    }
    port = await freePort();
    child = spawn(process.execPath, [BUILT_MAIN], {
      env: {
        ...process.env,
        DATABASE_URL: inject('databaseUrl'),
        PORT: String(port),
        NODE_ENV: 'production',
      },
    });
    child.stdout?.on('data', (chunk) => (output += String(chunk)));
    child.stderr?.on('data', (chunk) => (output += String(chunk)));
    const listening = await waitUntil(
      () => output.includes('successfully started'),
      STARTUP_LIMIT_MS,
    );
    if (!listening) throw new Error(`the built app did not start:\n${output}`);
  }, STARTUP_LIMIT_MS + 5000);

  afterAll(async () => {
    child.kill('SIGTERM');
    await once(child, 'exit');
  });

  it('should redact credentials and omit X-Powered-By when the built app runs', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/instruments`, {
      headers: {
        'X-User-Id': '1',
        Authorization: AUTHORIZATION,
        Cookie: COOKIE,
      },
    });
    await waitUntil(() => output.includes('"x-user-id"'), LOG_LIMIT_MS);

    expect(response.headers.get('x-powered-by')).toBeNull();
    expect(output).toContain('"x-user-id":"1"');
    expect(output).not.toContain(AUTHORIZATION);
    expect(output).not.toContain(COOKIE);
  });
});
