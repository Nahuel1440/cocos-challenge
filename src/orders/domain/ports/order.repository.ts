export const ORDER_REPOSITORY = Symbol('OrderRepository');

export interface OrderRepository {
  // Blocks until no other transaction holds this user's ledger lock; released at commit or rollback.
  lockLedger(userId: number): Promise<void>;
}
