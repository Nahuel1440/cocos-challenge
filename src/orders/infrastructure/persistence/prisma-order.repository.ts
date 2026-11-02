import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import type { OrderRepository } from '@/orders/domain/ports/order.repository';
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
}
