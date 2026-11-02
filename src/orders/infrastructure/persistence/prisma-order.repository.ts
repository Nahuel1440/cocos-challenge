import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import type {
  OrderRepository,
  SearchByUserParams,
} from '@/orders/domain/ports/order.repository';
import type { LedgerEntry } from '@/orders/domain/services/summarize-ledger.service';
import { OrderPersistenceMapper } from '@/orders/infrastructure/persistence/order-persistence.mapper';
import { assertTransactionActive } from '@/shared/infrastructure/transactions/assert-transaction-active';
import type { PrismaTransactionHost } from '@/shared/infrastructure/transactions/prisma-transaction-host';

// Namespace of the per-user advisory lock: the first key of pg_advisory_xact_lock(namespace, userId).
export const LEDGER_LOCK_NAMESPACE = 1;

@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  constructor(
    @Inject(TransactionHost) private readonly txHost: PrismaTransactionHost,
  ) {}

  public async lockLedger(userId: number): Promise<void> {
    assertTransactionActive(this.txHost);
    await this.txHost.tx.$executeRaw`
      SELECT pg_advisory_xact_lock(${LEDGER_LOCK_NAMESPACE}::int, ${userId}::int)`;
  }

  public async searchByUser(
    params: SearchByUserParams,
  ): Promise<LedgerEntry[]> {
    const { userId, statuses } = params;
    const rows = await this.txHost.tx.order.findMany({
      where: { userId, status: { in: statuses } },
    });

    return rows.map((row) => OrderPersistenceMapper.toLedgerEntry(row));
  }
}
