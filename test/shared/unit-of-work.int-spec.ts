import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTransactionHost } from '@/shared/infrastructure/transactions/prisma-transaction-host';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrdersModule } from '@/orders/orders.module';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@/orders/domain/ports/order.repository';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@/shared/application/unit-of-work.port';
import { PrismaModule } from '@/shared/infrastructure/prisma/prisma.module';
import { TransactionsModule } from '@/shared/infrastructure/transactions/transactions.module';
import { reloadSeed } from '../support/reload-seed';
import { truncateAllTables } from '../support/truncate-all-tables';

// Long enough for B to reach the lock while A holds it; the assertions never rest on it.
const LET_B_REACH_THE_LOCK_MS = 200;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function deferred() {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { released, release };
}

describe('UnitOfWork (integration)', () => {
  let app: INestApplication;
  let uow: UnitOfWork;
  let orders: OrderRepository;
  let txHost: PrismaTransactionHost;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, TransactionsModule, OrdersModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    uow = app.get(UNIT_OF_WORK);
    orders = app.get(ORDER_REPOSITORY);
    txHost = app.get(TransactionHost);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables();
    await reloadSeed();
  });

  it('should make the second transaction wait when both lock the same user', async () => {
    const events: string[] = [];
    const holdA = deferred();
    const aLocked = deferred();

    const a = uow.run(async () => {
      await orders.lockLedger(1);
      events.push('A locked');
      aLocked.release();
      await holdA.released;
      events.push('A commits');
    });
    await aLocked.released;
    const b = uow.run(async () => {
      await orders.lockLedger(1);
      events.push('B locked');
    });
    await pause(LET_B_REACH_THE_LOCK_MS);
    holdA.release();
    await Promise.all([a, b]);

    expect(events).toEqual(['A locked', 'A commits', 'B locked']);
  });

  it('should not block when two transactions lock different users', async () => {
    const events: string[] = [];
    const holdA = deferred();
    const aLocked = deferred();

    const a = uow.run(async () => {
      await orders.lockLedger(1);
      events.push('A locked');
      aLocked.release();
      await holdA.released;
      events.push('A commits');
    });
    await aLocked.released;
    await uow.run(async () => {
      await orders.lockLedger(2);
      events.push('B locked');
    });
    holdA.release();
    await a;

    expect(events).toEqual(['A locked', 'B locked', 'A commits']);
  });

  it('should see the row committed by the first transaction when the second was waiting for the lock', async () => {
    const holdA = deferred();
    const aLocked = deferred();

    const a = uow.run(async () => {
      await orders.lockLedger(1);
      await txHost.tx.order.create({
        data: {
          instrumentId: 31,
          userId: 1,
          size: 7777,
          price: '10.00',
          type: 'LIMIT',
          side: 'BUY',
          status: 'NEW',
          datetime: new Date(),
        },
      });
      aLocked.release();
      await holdA.released;
    });
    await aLocked.released;
    const b = uow.run(async () => {
      await orders.lockLedger(1);
      return txHost.tx.order.count({ where: { size: 7777 } });
    });
    await pause(LET_B_REACH_THE_LOCK_MS);
    holdA.release();
    const [, newOrdersSeenByB] = await Promise.all([a, b]);

    expect(newOrdersSeenByB).toBe(1);
  });

  it('should reject a write when the work runs with readOnly', async () => {
    const write = uow.run(
      () =>
        txHost.tx.order.create({
          data: {
            instrumentId: 31,
            userId: 1,
            size: 7777,
            price: '10.00',
            type: 'LIMIT',
            side: 'BUY',
            status: 'NEW',
            datetime: new Date(),
          },
        }),
      { readOnly: true },
    );

    await expect(write).rejects.toThrow();
    expect(await txHost.tx.order.count({ where: { size: 7777 } })).toBe(0);
  });
});
