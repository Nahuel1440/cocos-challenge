import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { createTestApp } from './support/create-test-app';
import {
  LEDGER_LOCK_NAMESPACE,
  waitForLedgerLockWaiters,
} from './support/ledger-lock';
import { reloadSeed } from './support/reload-seed';
import { truncateAllTables } from './support/truncate-all-tables';

const OWNER = 1;
const LIMIT_BUY = {
  instrumentId: 47,
  side: 'BUY',
  type: 'LIMIT',
  size: 1,
  price: '100.00',
};
const SHUTDOWN_HEAD_START_MS = 200;

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

  it('should finish an in-flight order when the application is closed', async () => {
    await holder.query('BEGIN');
    await holder.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [
      LEDGER_LOCK_NAMESPACE,
      OWNER,
    ]);
    const inFlight = fetch(`${await app.getUrl()}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': String(OWNER),
      },
      body: JSON.stringify(LIMIT_BUY),
    });
    await waitForLedgerLockWaiters(holder, OWNER);

    const closing = app.close();
    await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_HEAD_START_MS));
    await holder.query('COMMIT');

    const response = await inFlight;
    await closing;
    expect(response.status).toBe(201);
  });
});
