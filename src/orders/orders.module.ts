import { Module } from '@nestjs/common';
import { CancelOrderUseCase } from '@/orders/application/use-cases/cancel-order.use-case';
import { SendOrderUseCase } from '@/orders/application/use-cases/send-order.use-case';
import { INSTRUMENT_TYPE_REPOSITORY } from '@/orders/domain/ports/instrument-type.repository';
import { MARKET_DATA_REPOSITORY } from '@/orders/domain/ports/market-data.repository';
import { ORDER_REPOSITORY } from '@/orders/domain/ports/order.repository';
import { SummarizeLedgerService } from '@/orders/domain/services/summarize-ledger.service';
import { OrdersController } from '@/orders/infrastructure/http/orders.controller';
import { PrismaInstrumentTypeRepository } from '@/orders/infrastructure/persistence/prisma-instrument-type.repository';
import { PrismaMarketDataRepository } from '@/orders/infrastructure/persistence/prisma-market-data.repository';
import { PrismaOrderRepository } from '@/orders/infrastructure/persistence/prisma-order.repository';

@Module({
  controllers: [OrdersController],
  providers: [
    SendOrderUseCase,
    CancelOrderUseCase,
    SummarizeLedgerService,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    {
      provide: INSTRUMENT_TYPE_REPOSITORY,
      useClass: PrismaInstrumentTypeRepository,
    },
    { provide: MARKET_DATA_REPOSITORY, useClass: PrismaMarketDataRepository },
  ],
  exports: [ORDER_REPOSITORY, SummarizeLedgerService],
})
export class OrdersModule {}
