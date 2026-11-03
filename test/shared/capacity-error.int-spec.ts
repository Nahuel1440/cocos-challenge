import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { isCapacityError } from '@/shared/infrastructure/http/is-capacity-error';

const SMALL_POOL = 1;
const SHORT_WAIT_MS = 50;

describe('capacity errors raised by the real driver', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: inject('databaseUrl'),
        max: SMALL_POOL,
        connectionTimeoutMillis: SHORT_WAIT_MS,
      }),
    });
  });

  afterAll(() => prisma.$disconnect());

  const failWhileTheOnlyConnectionIsBusy = async (
    attempt: () => Promise<unknown>,
  ): Promise<unknown> => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let holding!: () => void;
    const holdsConnection = new Promise<void>((resolve) => {
      holding = resolve;
    });
    const transaction = prisma.$transaction(async (tx) => {
      await tx.user.count();
      holding();
      await held;
    });
    await holdsConnection;

    const failure = await attempt().catch((error: unknown) => error);
    release();
    await transaction;

    return failure;
  };

  it('should recognise the error of a query that cannot get a pool connection', async () => {
    const failure = await failWhileTheOnlyConnectionIsBusy(() =>
      prisma.user.count(),
    );

    expect(failure).toBeInstanceOf(Error);
    expect(isCapacityError(failure)).toBe(true);
  });

  it('should recognise a capacity error when a raw query times out on the pool', async () => {
    const failure = await failWhileTheOnlyConnectionIsBusy(
      () => prisma.$queryRaw`SELECT 1`,
    );

    expect(failure).toBeInstanceOf(Error);
    expect(isCapacityError(failure)).toBe(true);
  });

  it('should recognise the error of a transaction that cannot start in time', async () => {
    const failure = await failWhileTheOnlyConnectionIsBusy(() =>
      prisma.$transaction(() => Promise.resolve(), { maxWait: SHORT_WAIT_MS }),
    );

    expect(isCapacityError(failure)).toBe(true);
  });
});
