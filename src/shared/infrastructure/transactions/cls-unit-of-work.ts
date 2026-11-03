import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import type { UnitOfWork } from '@/shared/application/unit-of-work.port';
import type { PrismaTransactionHost } from '@/shared/infrastructure/transactions/prisma-transaction-host';

// Waiting for a pool connection, and the whole transaction: both stay above the 2000 ms ledger lock timeout.
const TRANSACTION_MAX_WAIT_MS = 2000;
const TRANSACTION_TIMEOUT_MS = 5000;

@Injectable()
export class ClsUnitOfWork implements UnitOfWork {
  constructor(
    @Inject(TransactionHost) private readonly txHost: PrismaTransactionHost,
  ) {}

  public run<T>(work: () => Promise<T>): Promise<T> {
    if (this.txHost.isTransactionActive()) return work();

    return this.txHost.withTransaction(
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
      work,
    );
  }
}
