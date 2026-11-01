import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '@/app.module';
import { DomainException } from '@/shared/domain/domain.exception';

@Controller('boom')
class BoomController {
  @Get()
  boom() {
    throw new DomainException('UNKNOWN_USER', 'User 999 does not exist');
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
});
