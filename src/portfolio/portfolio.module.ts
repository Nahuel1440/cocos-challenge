import { Module } from '@nestjs/common';
import { OrdersModule } from '@/orders/orders.module';
import { GetPortfolioUseCase } from '@/portfolio/application/use-cases/get-portfolio.use-case';
import { INSTRUMENT_QUOTE_REPOSITORY } from '@/portfolio/domain/ports/instrument-quote.repository';
import { BuildPortfolioService } from '@/portfolio/domain/services/build-portfolio.service';
import { PortfolioController } from '@/portfolio/infrastructure/http/portfolio.controller';
import { PrismaInstrumentQuoteRepository } from '@/portfolio/infrastructure/persistence/prisma-instrument-quote.repository';

@Module({
  imports: [OrdersModule],
  controllers: [PortfolioController],
  providers: [
    GetPortfolioUseCase,
    BuildPortfolioService,
    {
      provide: INSTRUMENT_QUOTE_REPOSITORY,
      useClass: PrismaInstrumentQuoteRepository,
    },
  ],
})
export class PortfolioModule {}
