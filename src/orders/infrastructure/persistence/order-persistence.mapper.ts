import Decimal from 'decimal.js';
import type { Prisma, Order as OrderRecord } from '@/generated/prisma/client';
import { Order } from '@/orders/domain/entities/order.entity';
import type {
  LedgerEntry,
  LedgerStatus,
} from '@/orders/domain/services/summarize-ledger.service';

export class OrderPersistenceMapper {
  public static toDomain(record: OrderRecord): Order {
    return Order.fromPrimitives({
      id: record.id,
      userId: record.userId,
      instrumentId: record.instrumentId,
      side: record.side as 'BUY' | 'SELL',
      type: record.type,
      size: record.size,
      price: record.price === null ? null : record.price.toString(),
      status: record.status,
      rejectionReason: record.rejectionReason,
      datetime: record.datetime,
      cancelledAt: record.cancelledAt,
    });
  }

  public static toPersistence(order: Order): Prisma.OrderUncheckedCreateInput {
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
  public static toLedgerEntry(record: OrderRecord): LedgerEntry {
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
