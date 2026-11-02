import type { INestApplication } from '@nestjs/common';
import Decimal from 'decimal.js';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './support/create-test-app';
import { reloadSeed } from './support/reload-seed';
import { truncateAllTables } from './support/truncate-all-tables';

const OWNER = '1';
const STRANGER = '2';
const INSTRUMENT_ID = 47;
const SHARES_INSTRUMENT_ID = 54;
const SHARES_HELD = 500;
const LARGE_LIMIT_BUY = { type: 'LIMIT', size: 6000, price: '100.00' };
const SEED_ORDER_IDS = {
  filled: 2,
  rejected: 6,
};

describe('POST /orders/:id/cancel', () => {
  let app: INestApplication;

  const sendOrder = (body: Record<string, unknown>, userId = OWNER) =>
    request(app.getHttpServer())
      .post('/orders')
      .set('X-User-Id', userId)
      .send({ instrumentId: INSTRUMENT_ID, side: 'BUY', ...body });

  const cancel = (id: number | string, userId = OWNER) =>
    request(app.getHttpServer())
      .post(`/orders/${id}/cancel`)
      .set('X-User-Id', userId);

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await truncateAllTables();
    await reloadSeed();
  });

  it('should return 200 with the CANCELLED order when the owner cancels a NEW order', async () => {
    const placed = await sendOrder({ type: 'LIMIT', size: 1, price: '100.00' });

    const response = await cancel(placed.body.id);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(placed.body.id);
    expect(response.body.status).toBe('CANCELLED');
    expect(response.body.cancelledAt).toEqual(expect.any(String));
  });

  it('should return 200 with the order unchanged when it is already CANCELLED', async () => {
    const placed = await sendOrder({ type: 'LIMIT', size: 1, price: '100.00' });
    const first = await cancel(placed.body.id).expect(200);

    const retry = await cancel(placed.body.id);

    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
  });

  it('should return 409 when the order is FILLED', async () => {
    const response = await cancel(SEED_ORDER_IDS.filled);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ORDER_NOT_CANCELLABLE');
  });

  it('should return 409 when the order is REJECTED', async () => {
    const response = await cancel(SEED_ORDER_IDS.rejected);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ORDER_NOT_CANCELLABLE');
  });

  it('should return 404 when the order does not exist', async () => {
    const MISSING_ID = 999999;

    const response = await cancel(MISSING_ID);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('ORDER_NOT_FOUND');
  });

  it('should return 404 when the order belongs to another user', async () => {
    const placed = await sendOrder({ type: 'LIMIT', size: 1, price: '100.00' });

    const response = await cancel(placed.body.id, STRANGER);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('ORDER_NOT_FOUND');
  });

  it('should return 400 VALIDATION_ERROR when the order id is not an integer', async () => {
    const BAD_IDS = ['abc', '1.5', '0', '2147483648', '1e0', '1.0', '0x1'];

    for (const id of BAD_IDS) {
      const response = await cancel(id);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('should release the reserved cash when a NEW BUY is cancelled', async () => {
    const reserving = await sendOrder(LARGE_LIMIT_BUY).expect(201);
    const blocked = await sendOrder(LARGE_LIMIT_BUY).expect(201);
    expect(blocked.body.rejectionReason).toBe('INSUFFICIENT_FUNDS');

    await cancel(reserving.body.id).expect(200);

    const fitsNow = await sendOrder(LARGE_LIMIT_BUY).expect(201);
    expect(fitsNow.body.status).toBe('NEW');
  });

  it('should release the reserved shares when a NEW SELL is cancelled', async () => {
    const sellAll = {
      instrumentId: SHARES_INSTRUMENT_ID,
      side: 'SELL',
      type: 'LIMIT',
      size: SHARES_HELD,
      price: '100.00',
    };
    const reserving = await sendOrder(sellAll).expect(201);
    const blocked = await sendOrder(sellAll).expect(201);
    expect(blocked.body.rejectionReason).toBe('INSUFFICIENT_SHARES');

    await cancel(reserving.body.id).expect(200);

    const fitsNow = await sendOrder(sellAll).expect(201);
    expect(fitsNow.body.status).toBe('NEW');
  });

  it('should fill the buy or reject it with INSUFFICIENT_FUNDS, consistent with the final cash, when a cancel of a NEW LIMIT buy and a MARKET buy run concurrently', async () => {
    const AVAILABLE_CASH_BEFORE = new Decimal('627500.00');
    const MARKET_PRICE = new Decimal('925.85');
    const MARKET_BUY_SIZE = 100;
    const reserving = await sendOrder(LARGE_LIMIT_BUY).expect(201);

    const [cancelled, marketBuy] = await Promise.all([
      cancel(reserving.body.id),
      sendOrder({ type: 'MARKET', size: MARKET_BUY_SIZE }),
    ]);

    expect(cancelled.status).toBe(200);
    expect(marketBuy.status).toBe(201);
    const filled = marketBuy.body.status === 'FILLED';
    if (!filled) {
      expect(marketBuy.body.rejectionReason).toBe('INSUFFICIENT_FUNDS');
    }
    const finalCash = filled
      ? AVAILABLE_CASH_BEFORE.minus(MARKET_PRICE.times(MARKET_BUY_SIZE))
      : AVAILABLE_CASH_BEFORE;
    const justAbove = await sendOrder({
      type: 'LIMIT',
      size: 1,
      price: finalCash.plus('0.01').toFixed(2),
    }).expect(201);
    expect(justAbove.body.rejectionReason).toBe('INSUFFICIENT_FUNDS');
    const exact = await sendOrder({
      type: 'LIMIT',
      size: 1,
      price: finalCash.toFixed(2),
    }).expect(201);
    expect(exact.body.status).toBe('NEW');
  });
});
