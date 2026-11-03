import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { reloadSeed } from './support/reload-seed';
import { truncateAllTables } from './support/truncate-all-tables';

const BUILT_MAIN = path.join(process.cwd(), 'dist', 'main.js');
const STARTUP_LIMIT_MS = 20000;
const LOG_LIMIT_MS = 5000;
const STOP_LIMIT_MS = 5000;
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

const answers = (url: string): Promise<boolean> =>
  fetch(url).then(
    () => true,
    () => false,
  );

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
    await truncateAllTables();
    await reloadSeed();
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
    let listening = false;
    const deadline = Date.now() + STARTUP_LIMIT_MS;
    while (!listening && child.exitCode === null && Date.now() < deadline) {
      listening = await answers(`http://127.0.0.1:${port}/`);
      if (!listening) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
    if (!listening) throw new Error(`the built app did not start:\n${output}`);
  }, STARTUP_LIMIT_MS + 5000);

  afterAll(async () => {
    if (!child || child.exitCode !== null) return;
    child.kill('SIGTERM');
    const forced = setTimeout(() => child.kill('SIGKILL'), STOP_LIMIT_MS);
    await once(child, 'exit');
    clearTimeout(forced);
  });

  it(
    'should redact credentials and omit X-Powered-By when the built app runs',
    async () => {
      const response = await fetch(`http://127.0.0.1:${port}/portfolio`, {
        headers: {
          'X-User-Id': '1',
          Authorization: AUTHORIZATION,
          Cookie: COOKIE,
        },
      });
      await waitUntil(() => output.includes('"x-user-id"'), LOG_LIMIT_MS);

      expect(response.status).toBe(200);
      expect(response.headers.get('x-powered-by')).toBeNull();
      expect(output).toContain('"x-user-id":"1"');
      expect(output).not.toContain(AUTHORIZATION);
      expect(output).not.toContain(COOKIE);
    },
    LOG_LIMIT_MS + 5000,
  );
});
