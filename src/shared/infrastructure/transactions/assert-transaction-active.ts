import type { PrismaTransactionHost } from '@/shared/infrastructure/transactions/prisma-transaction-host';

export class NoActiveTransactionError extends Error {
  constructor() {
    super('This call must run inside UnitOfWork.run()');
    this.name = NoActiveTransactionError.name;
  }
}

// Outside a transaction txHost.tx is the plain client, so a lock would be released at once.
export function assertTransactionActive(txHost: PrismaTransactionHost): void {
  if (!txHost.isTransactionActive()) {
    throw new NoActiveTransactionError();
  }
}
