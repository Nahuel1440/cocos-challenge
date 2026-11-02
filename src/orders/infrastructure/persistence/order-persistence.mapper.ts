import Decimal from 'decimal.js';
import type { Order } from '@/generated/prisma/client';
import type {
  LedgerEntry,
  LedgerStatus,
} from '@/orders/domain/services/summarize-ledger.service';

export class OrderPersistenceMapper {
  public static toLedgerEntry(row: Order): LedgerEntry {
    return {
      id: row.id,
      instrumentId: row.instrumentId,
      side: row.side,
      status: row.status as LedgerStatus,
      size: row.size!,
      price: new Decimal(row.price!.toString()),
      datetime: row.datetime,
    };
  }
}
