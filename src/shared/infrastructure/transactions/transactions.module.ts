import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { UNIT_OF_WORK } from '@/shared/application/unit-of-work.port';
import { PrismaModule } from '@/shared/infrastructure/prisma/prisma.module';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { ClsUnitOfWork } from '@/shared/infrastructure/transactions/cls-unit-of-work';

// Global so every use case injects UNIT_OF_WORK without importing this module.
@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      plugins: [
        new ClsPluginTransactional({
          imports: [PrismaModule],
          adapter: new TransactionalAdapterPrisma<PrismaService>({
            prismaInjectionToken: PrismaService,
          }),
        }),
      ],
    }),
  ],
  providers: [{ provide: UNIT_OF_WORK, useClass: ClsUnitOfWork }],
  exports: [UNIT_OF_WORK],
})
export class TransactionsModule {}
