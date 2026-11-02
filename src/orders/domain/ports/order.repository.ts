import type { Order } from '@/orders/domain/entities/order.entity';
import type {
  LedgerEntry,
  LedgerStatus,
} from '@/orders/domain/services/summarize-ledger.service';

export const ORDER_REPOSITORY = Symbol('OrderRepository');

export interface SearchByUserParams {
  userId: number;
  statuses: LedgerStatus[];
}

export interface OrderRepository {
  // Blocks until no other transaction holds this user's ledger lock; released at commit or rollback.
  lockLedger(userId: number): Promise<void>;
  searchByUser(params: SearchByUserParams): Promise<LedgerEntry[]>;
  save(order: Order): Promise<Order>;
}
