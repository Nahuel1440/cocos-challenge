import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import type {
  IsolationLevel,
  UnitOfWork,
  UnitOfWorkOptions,
} from '@/shared/application/unit-of-work.port';
import type { PrismaTransactionHost } from '@/shared/infrastructure/transactions/prisma-transaction-host';

const PRISMA_ISOLATION: Record<
  IsolationLevel,
  Prisma.TransactionIsolationLevel
> = {
  'read-committed': Prisma.TransactionIsolationLevel.ReadCommitted,
  'repeatable-read': Prisma.TransactionIsolationLevel.RepeatableRead,
  serializable: Prisma.TransactionIsolationLevel.Serializable,
};

@Injectable()
export class ClsUnitOfWork implements UnitOfWork {
  constructor(
    @Inject(TransactionHost) private readonly txHost: PrismaTransactionHost,
  ) {}

  public run<T>(
    work: () => Promise<T>,
    options?: UnitOfWorkOptions,
  ): Promise<T> {
    return this.txHost.withTransaction(
      {
        isolationLevel:
          PRISMA_ISOLATION[options?.isolation ?? 'read-committed'],
      },
      async () => {
        // Prisma has no read-only option for interactive transactions: set it before the work.
        if (options?.readOnly) {
          await this.txHost.tx.$executeRaw`SET TRANSACTION READ ONLY`;
        }
        return work();
      },
    );
  }
}
