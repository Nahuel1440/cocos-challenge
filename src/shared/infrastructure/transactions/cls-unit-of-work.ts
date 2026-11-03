import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import type { UnitOfWork } from '@/shared/application/unit-of-work.port';
import type { PrismaTransactionHost } from '@/shared/infrastructure/transactions/prisma-transaction-host';

@Injectable()
export class ClsUnitOfWork implements UnitOfWork {
  constructor(
    @Inject(TransactionHost) private readonly txHost: PrismaTransactionHost,
  ) {}

  public run<T>(work: () => Promise<T>): Promise<T> {
    if (this.txHost.isTransactionActive()) return work();

    return this.txHost.withTransaction(
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      work,
    );
  }
}
