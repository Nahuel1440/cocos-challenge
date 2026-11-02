import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@/orders/domain/ports/order.repository';
import { SummarizeLedgerService } from '@/orders/domain/services/summarize-ledger.service';
import { createTestApp } from './support/create-test-app';
import { reloadSeed } from './support/reload-seed';
import { truncateAllTables } from './support/truncate-all-tables';

const USER_WITH_CASH = '1';
const INSTRUMENT_ID = 47;

interface OrderBody {
  type: string;
  size?: number;
  amount?: string;
  price?: string;
  side?: string;
  instrumentId?: number;
}

describe('POST /orders', () => {
  let app: INestApplication;

  const sendOrder = (body: OrderBody) =>
    request(app.getHttpServer())
      .post('/orders')
      .set('X-User-Id', USER_WITH_CASH)
      .send({ instrumentId: INSTRUMENT_ID, side: 'BUY', ...body });

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

  it('should return 400 VALIDATION_ERROR when the price has more than 2 decimals', async () => {
    const response = await sendOrder({
      type: 'LIMIT',
      size: 1,
      price: '100.123',
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 VALIDATION_ERROR when the amount is not a decimal string', async () => {
    const response = await sendOrder({ type: 'MARKET', amount: 'abc' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 VALIDATION_ERROR when the amount is below 0.01', async () => {
    const response = await sendOrder({ type: 'MARKET', amount: '0.00' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 VALIDATION_ERROR when the price or amount is above 99999999.99', async () => {
    const ABOVE_MAX = '100000000.00';

    const priceResponse = await sendOrder({
      type: 'LIMIT',
      size: 1,
      price: ABOVE_MAX,
    });
    const amountResponse = await sendOrder({
      type: 'MARKET',
      amount: ABOVE_MAX,
    });

    expect(priceResponse.status).toBe(400);
    expect(priceResponse.body.code).toBe('VALIDATION_ERROR');
    expect(amountResponse.status).toBe(400);
    expect(amountResponse.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 VALIDATION_ERROR when the size is below 1', async () => {
    const response = await sendOrder({ type: 'MARKET', size: 0 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 VALIDATION_ERROR when the size is above 2147483647', async () => {
    const response = await sendOrder({ type: 'MARKET', size: 2147483648 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 VALIDATION_ERROR when a LIMIT amount buys 0 shares', async () => {
    const response = await sendOrder({
      type: 'LIMIT',
      amount: '50.00',
      price: '100.00',
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 VALIDATION_ERROR when neither size nor amount is sent', async () => {
    const response = await sendOrder({ type: 'MARKET' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 VALIDATION_ERROR when the side or type is invalid', async () => {
    const badSide = await sendOrder({ type: 'MARKET', size: 1, side: 'HOLD' });
    const badType = await sendOrder({ type: 'STOP', size: 1 });

    expect(badSide.status).toBe(400);
    expect(badSide.body.code).toBe('VALIDATION_ERROR');
    expect(badType.status).toBe(400);
    expect(badType.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 VALIDATION_ERROR when the instrument does not exist', async () => {
    const UNKNOWN_INSTRUMENT_ID = 9999;

    const response = await sendOrder({
      type: 'MARKET',
      size: 1,
      instrumentId: UNKNOWN_INSTRUMENT_ID,
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 VALIDATION_ERROR when the instrument is MONEDA', async () => {
    const ARS_INSTRUMENT_ID = 66;

    const response = await sendOrder({
      type: 'MARKET',
      size: 1,
      instrumentId: ARS_INSTRUMENT_ID,
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should never leave available cash negative when many concurrent buys compete for the same cash', async () => {
    const PARALLEL_BUYS = 8;
    const SIZE_THREE_FIT = 200;
    const FILLED_BUYS = 3;
    const CASH_LEFT = '71990';

    const responses = await Promise.all(
      Array.from({ length: PARALLEL_BUYS }, () =>
        sendOrder({ type: 'MARKET', size: SIZE_THREE_FIT }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array(PARALLEL_BUYS).fill(201),
    );
    const statuses = responses.map((response) => response.body.status);
    expect(statuses.filter((status) => status === 'FILLED')).toHaveLength(
      FILLED_BUYS,
    );
    expect(statuses.filter((status) => status === 'REJECTED')).toHaveLength(
      PARALLEL_BUYS - FILLED_BUYS,
    );
    const entries = await app
      .get<OrderRepository>(ORDER_REPOSITORY)
      .searchByUser({
        userId: Number(USER_WITH_CASH),
        statuses: ['FILLED', 'NEW'],
      });
    const summary = app.get(SummarizeLedgerService).run(entries);
    expect(summary.availableCash.toString()).toBe(CASH_LEFT);
  });
});
