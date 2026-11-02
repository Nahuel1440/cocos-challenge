import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { createTestApp } from './support/create-test-app';
import { reloadSeed } from './support/reload-seed';
import { truncateAllTables } from './support/truncate-all-tables';

describe('Test harness (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables();
    await reloadSeed();
  });

  it('should answer a query through the Prisma client when the app has booted on the seed database', async () => {
    const orders = await prisma.order.count();

    expect(orders).toBe(11);
  });

  it('should keep order 6 REJECTED with INSUFFICIENT_SHARES when the seed is reloaded after a truncate', async () => {
    await truncateAllTables();
    await reloadSeed();

    const order = await prisma.order.findUniqueOrThrow({ where: { id: 6 } });

    expect(order.status).toBe('REJECTED');
    expect(order.rejectionReason).toBe('INSUFFICIENT_SHARES');
  });
});
