import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './support/create-test-app';
import { reloadSeed } from './support/reload-seed';
import { truncateAllTables } from './support/truncate-all-tables';

const SEED_USER_ID = '1';

describe('GET /instruments', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await truncateAllTables();
    await reloadSeed();
  });

  async function searchTickers(query: string): Promise<string[]> {
    const response = await request(app.getHttpServer())
      .get('/instruments')
      .query({ query })
      .set('X-User-Id', SEED_USER_ID)
      .expect(200);

    return response.body.instruments.map(
      (instrument: { ticker: string }) => instrument.ticker,
    );
  }

  it('should reject with 400 VALIDATION_ERROR when the query parameter is missing', async () => {
    const response = await request(app.getHttpServer())
      .get('/instruments')
      .set('X-User-Id', SEED_USER_ID)
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('query'),
      requestId: response.headers['x-request-id'],
    });
  });

  it('should reject with 400 VALIDATION_ERROR when the query contains a NUL character', async () => {
    const response = await request(app.getHttpServer())
      .get('/instruments')
      .query({ query: 'a\0b' })
      .set('X-User-Id', SEED_USER_ID)
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('query'),
      requestId: response.headers['x-request-id'],
    });
  });

  it('should reject with 400 VALIDATION_ERROR when the query is longer than 100 characters', async () => {
    const MAX_QUERY_LENGTH = 100;

    const response = await request(app.getHttpServer())
      .get('/instruments')
      .query({ query: 'a'.repeat(MAX_QUERY_LENGTH + 1) })
      .set('X-User-Id', SEED_USER_ID)
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('query'),
      requestId: response.headers['x-request-id'],
    });
  });

  it('should reject with 400 VALIDATION_ERROR when the query string has an unknown parameter', async () => {
    const response = await request(app.getHttpServer())
      .get('/instruments')
      .query({ query: 'pam', q: 'pam' })
      .set('X-User-Id', SEED_USER_ID)
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('q'),
      requestId: response.headers['x-request-id'],
    });
  });

  it('should rank an exact ticker match first, then ticker prefix, then name prefix, then substring when several instruments match', async () => {
    const EXACT_THEN_NAME_PREFIX = ['TRAN', 'TGNO4', 'TGSU2'];
    const PREFIX_THEN_NAME_PREFIX_THEN_SUBSTRING = [
      'TRAN',
      'TGNO4',
      'TGSU2',
      'CECO2',
      'CEPU',
      'DGCU2',
      'INTR',
      'METR',
      'MTR',
    ];

    const byExactTicker = await searchTickers('tran');
    const byPrefix = await searchTickers('tr');

    expect(byExactTicker).toEqual(EXACT_THEN_NAME_PREFIX);
    expect(byPrefix).toEqual(PREFIX_THEN_NAME_PREFIX_THEN_SUBSTRING);
  });

  it('should match ticker and name ignoring case when the query mixes upper and lower case', async () => {
    const PAMPA = ['PAMP'];

    const byTicker = await searchTickers('pAmP');
    const byName = await searchTickers('PAMPA hOlDiNg');

    expect(byTicker).toEqual(PAMPA);
    expect(byName).toEqual(PAMPA);
  });

  it('should not return MONEDA instruments when the query matches ARS', async () => {
    const tickers = await searchTickers('ars');

    expect(tickers).not.toContain('ARS');
  });

  it('should return an empty list when the query is only a LIKE wildcard such as % or _', async () => {
    const percent = await searchTickers('%');
    const underscore = await searchTickers('_');

    expect(percent).toEqual([]);
    expect(underscore).toEqual([]);
  });
});
