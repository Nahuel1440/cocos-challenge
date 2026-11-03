import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import type { Prisma, Order as OrderRecord } from '@/generated/prisma/client';
import { Order, type OrderSide } from '@/orders/domain/entities/order.entity';
import { OrderNotFoundException } from '@/orders/domain/exceptions/order-not-found.exception';
import type {
  FindByIdForUserParams,
  OrderRepository,
  SearchByUserParams,
} from '@/orders/domain/ports/order.repository';
import type {
  LedgerEntry,
  LedgerStatus,
} from '@/orders/domain/services/summarize-ledger.service';
import { assertTransactionActive } from '@/shared/infrastructure/transactions/assert-transaction-active';
import type { PrismaTransactionHost } from '@/shared/infrastructure/transactions/prisma-transaction-host';

// Namespace of the per-user advisory lock: the first key of pg_advisory_xact_lock(namespace, userId).
const LEDGER_LOCK_NAMESPACE = 1;

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

    return records.map((record) => this.toLedgerEntry(record));
  }

  public async findByIdForUser(params: FindByIdForUserParams): Promise<Order> {
    const { orderId, userId } = params;
    const record = await this.txHost.tx.order.findFirst({
      where: { id: orderId, userId },
    });
    if (record === null) {
      throw new OrderNotFoundException(orderId);
    }

    return this.toDomain(record);
  }

  public async save(order: Order): Promise<Order> {
    const data = this.toPersistence(order);
    const id = order.toPrimitives().id;
    const record =
      id === null
        ? await this.txHost.tx.order.create({ data })
        : await this.txHost.tx.order.update({ where: { id }, data });

    return this.toDomain(record);
  }

  private toDomain(record: OrderRecord): Order {
    return Order.fromPrimitives({
      id: record.id,
      userId: record.userId,
      instrumentId: record.instrumentId,
      side: record.side as OrderSide,
      type: record.type,
      size: record.size,
      price: record.price === null ? null : record.price.toString(),
      status: record.status,
      rejectionReason: record.rejectionReason,
      datetime: record.datetime,
      cancelledAt: record.cancelledAt,
    });
  }

  private toPersistence(order: Order): Prisma.OrderUncheckedCreateInput {
    const data = order.toPrimitives();

    return {
      userId: data.userId,
      instrumentId: data.instrumentId,
      side: data.side,
      type: data.type,
      size: data.size,
      price: data.price,
      status: data.status,
      rejectionReason: data.rejectionReason,
      datetime: data.datetime,
      cancelledAt: data.cancelledAt,
    };
  }

  // FILLED and NEW rows always have size and price: the table CHECKs only let REJECTED rows hold NULL.
  private toLedgerEntry(record: OrderRecord): LedgerEntry {
    return {
      id: record.id,
      instrumentId: record.instrumentId,
      side: record.side,
      status: record.status as LedgerStatus,
      size: record.size!,
      price: new Decimal(record.price!.toString()),
      datetime: record.datetime,
    };
  }
}
