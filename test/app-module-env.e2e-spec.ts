import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '@/app.module';
import { buildPinoHttpOptions } from '@/shared/infrastructure/http/pino-http-options';

vi.mock('@/shared/infrastructure/http/pino-http-options', async (original) => {
  const actual =
    await original<
      typeof import('@/shared/infrastructure/http/pino-http-options')
    >();
  return { buildPinoHttpOptions: vi.fn(actual.buildPinoHttpOptions) };
});

describe('app module environment', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('should read NODE_ENV when the app is created, not when the module is imported', async () => {
    const CREATION_ENV = 'production';
    vi.stubEnv('NODE_ENV', CREATION_ENV);

    await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(buildPinoHttpOptions).toHaveBeenCalledWith(CREATION_ENV);
  });
});
