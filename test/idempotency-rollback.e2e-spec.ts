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
  vi,
} from 'vitest';
import {
  IDEMPOTENCY_REPOSITORY,
  type IdempotencyRepository,
} from '@/orders/domain/ports/idempotency.repository';
import { createTestApp } from './support/create-test-app';
import { reloadSeed } from './support/reload-seed';
import { truncateAllTables } from './support/truncate-all-tables';

const OWNER = '1';
const LIMIT_BUY = {
  instrumentId: 47,
  side: 'BUY',
  type: 'LIMIT',
  size: 1,
  price: '100.00',
};

async function countRows(table: string): Promise<number> {
  const client = new Client({ connectionString: inject('databaseUrl') });
  await client.connect();
  try {
    const { rows } = await client.query<{ total: string }>(
      `SELECT count(*) AS total FROM public."${table}"`,
    );
    return Number(rows[0]?.total ?? 0);
  } finally {
    await client.end();
  }
}

describe('POST /orders when the idempotent response cannot be saved', () => {
  let app: INestApplication;

  const sendOrder = (key: string) =>
    request(app.getHttpServer())
      .post('/orders')
      .set('X-User-Id', OWNER)
      .set('Idempotency-Key', key)
      .send(LIMIT_BUY);

  const availableCash = async () => {
    const response = await request(app.getHttpServer())
      .get('/portfolio')
      .set('X-User-Id', OWNER)
      .expect(200);
    return response.body.availableCash as string;
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await truncateAllTables();
    await reloadSeed();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should roll back the order and the idempotent response when saving the response fails', async () => {
    const key = randomUUID();
    const ordersBefore = await countRows('orders');
    const cashBefore = await availableCash();
    vi.spyOn(
      app.get<IdempotencyRepository>(IDEMPOTENCY_REPOSITORY),
      'save',
    ).mockRejectedValueOnce(new Error('response could not be saved'));

    const failed = await sendOrder(key);

    expect(failed.status).toBe(500);
    expect(failed.body.code).toBe('INTERNAL_ERROR');
    expect(await countRows('orders')).toBe(ordersBefore);
    expect(await countRows('idempotency_requests')).toBe(0);
    expect(await availableCash()).toBe(cashBefore);

    const retry = await sendOrder(key);

    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBeUndefined();
    expect(await countRows('orders')).toBe(ordersBefore + 1);
  });
});
