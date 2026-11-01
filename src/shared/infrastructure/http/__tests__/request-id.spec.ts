import {
  Body,
  Controller,
  Get,
  Post,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '@/app.module';
import { DomainException } from '@/shared/domain/exceptions/domain.exception';

@Controller('boom')
class BoomController {
  @Get()
  boom() {
    throw new DomainException('UNKNOWN_USER', 'User 999 does not exist');
  }

  @Get('ok')
  ok() {
    return { ok: true };
  }

  @Post('echo')
  echo(@Body() body: unknown) {
    return body;
  }
}

describe('request id', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [BoomController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(() => app.close());

  it('should return the request id in the X-Request-Id header and the error body when a request fails', async () => {
    const response = await fetch(`${baseUrl}/boom`, {
      headers: { 'X-Request-Id': 'client-chosen' },
    });
    const body = (await response.json()) as { requestId: string };

    const requestId = response.headers.get('X-Request-Id');
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId).not.toBe('client-chosen');
    expect(body.requestId).toBe(requestId);
  });

  it('should return the X-Request-Id header on a successful response', async () => {
    const response = await fetch(`${baseUrl}/boom/ok`);

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should return the request id in the X-Request-Id header and the error body when the JSON body is malformed', async () => {
    const response = await fetch(`${baseUrl}/boom/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    });
    const body = (await response.json()) as {
      code: string;
      requestId: string;
    };

    const requestId = response.headers.get('X-Request-Id');
    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.requestId).toBe(requestId);
  });

  it('should keep the status of a body parser error and render the D-29 body when the request body is too large', async () => {
    const response = await fetch(`${baseUrl}/boom/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'x'.repeat(200_000) }),
    });
    const text = await response.text();
    const body = JSON.parse(text) as Record<string, unknown>;

    const requestId = response.headers.get('X-Request-Id');
    expect(response.status).toBe(413);
    expect(body).toEqual({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: expect.any(String),
      requestId,
    });
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(text).not.toContain('    at ');
  });
});
