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

  it('should keep order 6 REJECTED with INSUFFICIENT_SHARES when the seed is reloaded after a truncate', async () => {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: 6 } });

    expect(order.status).toBe('REJECTED');
    expect(order.rejectionReason).toBe('INSUFFICIENT_SHARES');
  });
});
