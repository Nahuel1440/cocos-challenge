import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';
import { createTestApp } from './support/create-test-app';
import {
  LEDGER_LOCK_NAMESPACE,
  waitForLedgerLockWaiters,
} from './support/ledger-lock';
import { reloadSeed } from './support/reload-seed';
import { truncateAllTables } from './support/truncate-all-tables';

const OWNER = 1;
const OTHER_USER = 2;
const LIMIT_BUY = {
  instrumentId: 47,
  side: 'BUY',
  type: 'LIMIT',
  size: 1,
  price: '100.00',
};
const LOCK_TEST_TIMEOUT_MS = 10000;

async function countRows(client: Client, table: string): Promise<number> {
  const { rows } = await client.query<{ total: string }>(
    `SELECT count(*) AS total FROM public."${table}"`,
  );
  return Number(rows[0]?.total ?? 0);
}

describe('ledger lock timeout', () => {
  let app: INestApplication;
  let holder: Client;

  const sendOrder = (userId: number) =>
    request(app.getHttpServer())
      .post('/orders')
      .set('X-User-Id', String(userId))
      .send(LIMIT_BUY);

  const cancel = (orderId: number, userId: number) =>
    request(app.getHttpServer())
      .post(`/orders/${orderId}/cancel`)
      .set('X-User-Id', String(userId));

  const holdLock = async (userId: number) => {
    await holder.query('BEGIN');
    await holder.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [
      LEDGER_LOCK_NAMESPACE,
      userId,
    ]);
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await truncateAllTables();
    await reloadSeed();
    holder = new Client({ connectionString: inject('databaseUrl') });
    await holder.connect();
  });

  afterEach(async () => {
    await holder.query('ROLLBACK').catch(() => undefined);
    await holder.end();
  });

  it(
    'should answer 503 LEDGER_BUSY with Retry-After 1 when the user lock stays held',
    async () => {
      await holdLock(OWNER);

      const pending = sendOrder(OWNER).then((response) => response);
      expect(await waitForLedgerLockWaiters(holder, OWNER)).toBe(1);
      const response = await pending;

      expect(response.status).toBe(503);
      expect(response.headers['retry-after']).toBe('1');
      expect(response.body).toEqual({
        statusCode: 503,
        code: 'LEDGER_BUSY',
        message: expect.any(String),
        requestId: response.headers['x-request-id'],
      });
    },
    LOCK_TEST_TIMEOUT_MS,
  );

  it(
    'should answer 503 LEDGER_BUSY when a cancel waits on a held user lock',
    async () => {
      const placed = await sendOrder(OWNER).expect(201);
      await holdLock(OWNER);

      const pending = cancel(placed.body.id, OWNER).then(
        (response) => response,
      );
      expect(await waitForLedgerLockWaiters(holder, OWNER)).toBe(1);
      const response = await pending;

      expect(response.status).toBe(503);
      expect(response.headers['retry-after']).toBe('1');
      expect(response.body.code).toBe('LEDGER_BUSY');
    },
    LOCK_TEST_TIMEOUT_MS,
  );

  it(
    'should leave no order and no idempotency row when the lock times out, and accept the same key once the lock is free',
    async () => {
      const key = randomUUID();
      const ordersBefore = await countRows(holder, 'orders');
      await holdLock(OWNER);

      const pending = sendOrder(OWNER)
        .set('Idempotency-Key', key)
        .then((response) => response);
      expect(await waitForLedgerLockWaiters(holder, OWNER)).toBe(1);
      const busy = await pending;

      expect(busy.status).toBe(503);
      expect(await countRows(holder, 'orders')).toBe(ordersBefore);
      expect(await countRows(holder, 'idempotency_requests')).toBe(0);

      await holder.query('ROLLBACK');
      const retry = await sendOrder(OWNER).set('Idempotency-Key', key);

      expect(retry.status).toBe(201);
      expect(retry.headers['idempotent-replayed']).toBeUndefined();
      expect(await countRows(holder, 'orders')).toBe(ordersBefore + 1);
    },
    LOCK_TEST_TIMEOUT_MS,
  );

  it(
    "should keep serving another user while one user's lock is held",
    async () => {
      await holdLock(OWNER);
      const pending = sendOrder(OWNER).then((response) => response);
      expect(await waitForLedgerLockWaiters(holder, OWNER)).toBe(1);

      const other = await sendOrder(OTHER_USER);

      expect(other.status).toBe(201);
      expect((await pending).status).toBe(503);
    },
    LOCK_TEST_TIMEOUT_MS,
  );
});
