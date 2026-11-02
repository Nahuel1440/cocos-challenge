import type { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';

export type PrismaTransactionHost = TransactionHost<
  TransactionalAdapterPrisma<PrismaService>
>;
