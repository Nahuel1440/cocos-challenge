import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './support/create-test-app';
import { reloadSeed } from './support/reload-seed';
import { truncateAllTables } from './support/truncate-all-tables';

const SEED_USER_ID = '1';
const BMA_ID = 31;

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

  it('should show the negative seed holding as is with a null return', async () => {
    const response = await request(app.getHttpServer())
      .get('/portfolio')
      .set('X-User-Id', SEED_USER_ID)
      .expect(200);

    const holding = response.body.positions.find(
      (position: { instrumentId: number }) => position.instrumentId === BMA_ID,
    );
    expect(holding).toEqual({
      instrumentId: 31,
      ticker: 'BMA',
      name: 'Banco Macro S.A.',
      quantity: -10,
      marketValue: '-15028.00',
      averagePrice: null,
      totalReturnPercentage: null,
    });
  });
});
