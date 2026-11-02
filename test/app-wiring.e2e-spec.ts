import {
  Body,
  Controller,
  Get,
  Post,
  type INestApplication,
} from '@nestjs/common';
import { IsInt } from 'class-validator';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { reloadSeed } from './support/reload-seed';
import { createTestApp } from './support/create-test-app';
import { truncateAllTables } from './support/truncate-all-tables';

class SizeDto {
  @IsInt()
  public size!: number;
}

@Controller('wiring')
class WiringController {
  @Get()
  public ping() {
    return { ok: true };
  }

  @Post()
  public create(@Body() dto: SizeDto) {
    return dto;
  }
}

describe('app wiring', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp([WiringController]);
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await truncateAllTables();
    await reloadSeed();
  });

  it('should reject with 400 MISSING_USER_ID when a route is called without the X-User-Id header', async () => {
    const response = await request(app.getHttpServer())
      .get('/wiring')
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'MISSING_USER_ID',
      message: expect.any(String),
      requestId: response.headers['x-request-id'],
    });
  });

  it('should reject with 400 UNKNOWN_USER when the X-User-Id user does not exist', async () => {
    const response = await request(app.getHttpServer())
      .get('/wiring')
      .set('X-User-Id', '999')
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'UNKNOWN_USER',
      message: 'User 999 does not exist',
      requestId: response.headers['x-request-id'],
    });
  });

  it('should reject with 400 VALIDATION_ERROR when a request DTO fails validation', async () => {
    const response = await request(app.getHttpServer())
      .post('/wiring')
      .set('X-User-Id', '1')
      .send({ size: 'many' })
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('size'),
      requestId: response.headers['x-request-id'],
    });
  });
});
