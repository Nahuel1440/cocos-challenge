import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import type { Order } from '@/orders/domain/entities/order.entity';
import { OrderNotFoundException } from '@/orders/domain/exceptions/order-not-found.exception';
import type {
  FindByIdForUserParams,
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
    const records = await this.txHost.tx.order.findMany({
      where: { userId, status: { in: statuses } },
    });

    return records.map((record) =>
      OrderPersistenceMapper.toLedgerEntry(record),
    );
  }

  public async findByIdForUser(params: FindByIdForUserParams): Promise<Order> {
    const { orderId, userId } = params;
    const record = await this.txHost.tx.order.findFirst({
      where: { id: orderId, userId },
    });
    if (record === null) {
      throw new OrderNotFoundException(orderId);
    }

    return OrderPersistenceMapper.toDomain(record);
  }

  public async save(order: Order): Promise<Order> {
    const data = OrderPersistenceMapper.toPersistence(order);
    const id = order.toPrimitives().id;
    const record =
      id === null
        ? await this.txHost.tx.order.create({ data })
        : await this.txHost.tx.order.update({ where: { id }, data });

    return OrderPersistenceMapper.toDomain(record);
  }
}
