import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { createTestApp } from './support/create-test-app';
import {
  LEDGER_LOCK_NAMESPACE,
  waitForLedgerLockWaiters,
} from './support/ledger-lock';
import { reloadSeed } from './support/reload-seed';
import { waitForRefusal } from './support/wait-for-refusal';
import { truncateAllTables } from './support/truncate-all-tables';

const OWNER = 1;
const LIMIT_BUY = {
  instrumentId: 47,
  side: 'BUY',
  type: 'LIMIT',
  size: 1,
  price: '100.00',
};
const SHUTDOWN_REFUSAL_LIMIT_MS = 5000;
const SHUTDOWN_TEST_TIMEOUT_MS = 20000;

describe('graceful shutdown', () => {
  let holder: Client;
  let app: INestApplication;

  beforeEach(async () => {
    await truncateAllTables();
    await reloadSeed();
    holder = new Client({ connectionString: inject('databaseUrl') });
    await holder.connect();
    app = await createTestApp();
    await app.listen(0);
  });

  afterEach(async () => {
    await holder.query('ROLLBACK').catch(() => undefined);
    await holder.end();
    await app.close();
  });

  it(
    'should finish an in-flight order when the application is closed',
    async () => {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [
        LEDGER_LOCK_NAMESPACE,
        OWNER,
      ]);
      const url = await app.getUrl();
      const inFlight = fetch(`${url}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': String(OWNER),
        },
        body: JSON.stringify(LIMIT_BUY),
      });
      const waiters = await waitForLedgerLockWaiters(holder, OWNER);
      expect(waiters).toBe(1);

      const closing = app.close();
      const refusing = await waitForRefusal(url, SHUTDOWN_REFUSAL_LIMIT_MS);
      expect(refusing).toBe(true);
      await holder.query('COMMIT');

      const response = await inFlight;
      await closing;
      expect(response.status).toBe(201);
    },
    SHUTDOWN_TEST_TIMEOUT_MS,
  );
});
