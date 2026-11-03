import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './support/create-test-app';
import { reloadSeed } from './support/reload-seed';
import { truncateAllTables } from './support/truncate-all-tables';

const OWNER = '1';
const OTHER_USER = '2';
const INSTRUMENT_ID = 47;
const LIMIT_BUY = {
  instrumentId: INSTRUMENT_ID,
  side: 'BUY',
  type: 'LIMIT',
  size: 1,
  price: '100.00',
};
const LARGE_LIMIT_BUY = { ...LIMIT_BUY, size: 6000 };

describe('POST /orders with Idempotency-Key', () => {
  let app: INestApplication;

  const sendOrder = (
    body: Record<string, unknown>,
    key?: string,
    userId = OWNER,
  ) => {
    const call = request(app.getHttpServer())
      .post('/orders')
      .set('X-User-Id', userId);
    if (key !== undefined) call.set('Idempotency-Key', key);
    return call.send(body);
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await truncateAllTables();
    await reloadSeed();
  });

  it('should return the original response with Idempotent-Replayed when the same key and body are retried', async () => {
    const key = randomUUID();
    const first = await sendOrder(LIMIT_BUY, key).expect(201);

    const retry = await sendOrder(LIMIT_BUY, key);

    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.headers.location).toBe(first.headers.location);
    expect(retry.body).toEqual(first.body);
  });

  it('should not add Idempotent-Replayed on the first request', async () => {
    const response = await sendOrder(LIMIT_BUY, randomUUID());

    expect(response.status).toBe(201);
    expect(response.headers['idempotent-replayed']).toBeUndefined();
  });

  it('should store only one order when the same key is retried', async () => {
    const key = randomUUID();
    const first = await sendOrder(LIMIT_BUY, key).expect(201);
    await sendOrder(LIMIT_BUY, key).expect(201);

    const next = await sendOrder(LIMIT_BUY).expect(201);

    expect(next.body.id).toBe(first.body.id + 1);
  });

  it('should return 422 when the same key comes with a different body', async () => {
    const key = randomUUID();
    await sendOrder(LIMIT_BUY, key).expect(201);

    const response = await sendOrder({ ...LIMIT_BUY, size: 2 }, key);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('should return 422 when the same key comes with a different price', async () => {
    const key = randomUUID();
    await sendOrder(LIMIT_BUY, key).expect(201);

    const response = await sendOrder({ ...LIMIT_BUY, price: '101.00' }, key);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('should return the original rejection on retry after a cancel frees the cash', async () => {
    const key = randomUUID();
    const reserving = await sendOrder(LARGE_LIMIT_BUY).expect(201);
    const rejected = await sendOrder(LARGE_LIMIT_BUY, key).expect(201);
    expect(rejected.body.rejectionReason).toBe('INSUFFICIENT_FUNDS');
    await request(app.getHttpServer())
      .post(`/orders/${reserving.body.id}/cancel`)
      .set('X-User-Id', OWNER)
      .expect(200);

    const retry = await sendOrder(LARGE_LIMIT_BUY, key);

    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body).toEqual(rejected.body);
  });

  it('should return the original response on retry after the order was cancelled', async () => {
    const key = randomUUID();
    const first = await sendOrder(LIMIT_BUY, key).expect(201);
    await request(app.getHttpServer())
      .post(`/orders/${first.body.id}/cancel`)
      .set('X-User-Id', OWNER)
      .expect(200);

    const retry = await sendOrder(LIMIT_BUY, key);

    expect(retry.status).toBe(201);
    expect(retry.body.status).toBe('NEW');
    expect(retry.body).toEqual(first.body);
  });

  it('should treat the same key from another user as a new request', async () => {
    const key = randomUUID();
    const first = await sendOrder(LIMIT_BUY, key).expect(201);

    const other = await sendOrder(LIMIT_BUY, key, OTHER_USER);

    expect(other.status).toBe(201);
    expect(other.headers['idempotent-replayed']).toBeUndefined();
    expect(other.body.id).not.toBe(first.body.id);
    expect(other.body.userId).toBe(Number(OTHER_USER));
  });

  it('should store only one order when two requests with the same key run concurrently', async () => {
    const key = randomUUID();

    const responses = await Promise.all([
      sendOrder(LIMIT_BUY, key),
      sendOrder(LIMIT_BUY, key),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    const replays = responses.filter(
      (response) => response.headers['idempotent-replayed'] === 'true',
    );
    expect(replays).toHaveLength(1);
  });

  it('should not consume the key when the request is invalid', async () => {
    const key = randomUUID();
    const invalid = await sendOrder({ ...LIMIT_BUY, size: 0 }, key);
    expect(invalid.status).toBe(400);

    const valid = await sendOrder(LIMIT_BUY, key);

    expect(valid.status).toBe(201);
    expect(valid.headers['idempotent-replayed']).toBeUndefined();
  });

  it('should return 400 VALIDATION_ERROR when the Idempotency-Key is not a UUID', async () => {
    const response = await sendOrder(LIMIT_BUY, 'not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});
