import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';
import { createTestApp } from './support/create-test-app';
import { reloadSeed } from './support/reload-seed';
import { truncateAllTables } from './support/truncate-all-tables';

const SEED_USER_ID = '1';

describe('GET /portfolio', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await truncateAllTables();
    await reloadSeed();
  });

  it('should return total value, available cash and positions for a seed user', async () => {
    const response = await request(app.getHttpServer())
      .get('/portfolio')
      .set('X-User-Id', SEED_USER_ID)
      .expect(200);

    expect(response.body).toEqual({
      totalValue: '889756.00',
      availableCash: '627500.00',
      positions: [
        {
          instrumentId: 31,
          ticker: 'BMA',
          name: 'Banco Macro S.A.',
          quantity: -10,
          marketValue: '-15028.00',
          averagePrice: null,
          totalReturnPercentage: null,
        },
        {
          instrumentId: 47,
          ticker: 'PAMP',
          name: 'Pampa Holding S.A.',
          quantity: 40,
          marketValue: '37034.00',
          averagePrice: '930.00',
          totalReturnPercentage: '-0.45',
        },
        {
          instrumentId: 54,
          ticker: 'METR',
          name: 'MetroGAS S.A.',
          quantity: 500,
          marketValue: '114750.00',
          averagePrice: '250.00',
          totalReturnPercentage: '-8.20',
        },
      ],
    });
  });

  it('should return an empty portfolio when the user has no orders', async () => {
    const USER_WITHOUT_ORDERS = '2';

    const response = await request(app.getHttpServer())
      .get('/portfolio')
      .set('X-User-Id', USER_WITHOUT_ORDERS)
      .expect(200);

    expect(response.body).toEqual({
      totalValue: '0.00',
      availableCash: '0.00',
      positions: [],
    });
  });

  it('should include a just-placed order in the portfolio as the newest entry', async () => {
    const PAMP_ID = 47;
    await request(app.getHttpServer())
      .post('/orders')
      .set('X-User-Id', SEED_USER_ID)
      .send({ instrumentId: PAMP_ID, side: 'BUY', type: 'MARKET', size: 10 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/portfolio')
      .set('X-User-Id', SEED_USER_ID)
      .expect(200);

    const pamp = response.body.positions.find(
      (position: { instrumentId: number }) => position.instrumentId === PAMP_ID,
    );
    expect(pamp.quantity).toBe(50);
    expect(pamp.averagePrice).toBe('929.17');
    expect(pamp.marketValue).toBe('46292.50');
    expect(response.body.availableCash).toBe('618241.50');
    expect(response.body.totalValue).toBe('889756.00');
  });

  it('should return null market value and leave the position out of the total when it has no price', async () => {
    const client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    try {
      await client.query(
        'DELETE FROM public.marketdata WHERE instrumentid = 54',
      );
    } finally {
      await client.end();
    }

    const response = await request(app.getHttpServer())
      .get('/portfolio')
      .set('X-User-Id', SEED_USER_ID)
      .expect(200);

    const unpriced = response.body.positions.find(
      (position: { instrumentId: number }) => position.instrumentId === 54,
    );
    expect(unpriced.quantity).toBe(500);
    expect(unpriced.marketValue).toBeNull();
    expect(unpriced.totalReturnPercentage).toBeNull();
    expect(response.body.totalValue).toBe('775006.00');
  });
});
