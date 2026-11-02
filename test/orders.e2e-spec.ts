import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './support/create-test-app';
import { reloadSeed } from './support/reload-seed';
import { truncateAllTables } from './support/truncate-all-tables';

const USER_WITH_CASH = '1';
const INSTRUMENT_ID = 47;

describe('POST /orders', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await truncateAllTables();
    await reloadSeed();
  });

  it('should return 201 FILLED with a Location when a MARKET BUY has enough cash', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('X-User-Id', USER_WITH_CASH)
      .send({
        instrumentId: INSTRUMENT_ID,
        side: 'BUY',
        type: 'MARKET',
        size: 1,
      })
      .expect(201);

    expect(response.body.status).toBe('FILLED');
    expect(response.headers.location).toBe(`/orders/${response.body.id}`);
  });

  it('should return 400 VALIDATION_ERROR when both size and amount are sent', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('X-User-Id', USER_WITH_CASH)
      .send({
        instrumentId: INSTRUMENT_ID,
        side: 'BUY',
        type: 'MARKET',
        size: 1,
        amount: '100.00',
      })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 VALIDATION_ERROR when a LIMIT has no price', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('X-User-Id', USER_WITH_CASH)
      .send({
        instrumentId: INSTRUMENT_ID,
        side: 'BUY',
        type: 'LIMIT',
        size: 1,
      })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 VALIDATION_ERROR when a LIMIT amount gives a size above the INT maximum', async () => {
    const HUGE_AMOUNT = '99999999.99';
    const TINY_PRICE = '0.01';

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('X-User-Id', USER_WITH_CASH)
      .send({
        instrumentId: INSTRUMENT_ID,
        side: 'BUY',
        type: 'LIMIT',
        amount: HUGE_AMOUNT,
        price: TINY_PRICE,
      })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should fill one order and reject the other with INSUFFICIENT_FUNDS when two concurrent buys only fit one at a time', async () => {
    const SIZE_FITTING_ONCE = 500;
    const buy = () =>
      request(app.getHttpServer())
        .post('/orders')
        .set('X-User-Id', USER_WITH_CASH)
        .send({
          instrumentId: INSTRUMENT_ID,
          side: 'BUY',
          type: 'MARKET',
          size: SIZE_FITTING_ONCE,
        });

    const responses = await Promise.all([buy(), buy()]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const outcomes = responses
      .map((response) => [response.body.status, response.body.rejectionReason])
      .sort();
    expect(outcomes).toEqual([
      ['FILLED', null],
      ['REJECTED', 'INSUFFICIENT_FUNDS'],
    ]);
  });
});
