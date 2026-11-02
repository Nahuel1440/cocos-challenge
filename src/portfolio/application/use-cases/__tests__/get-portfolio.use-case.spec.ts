import { describe, expect, it, type Mocked, vi } from 'vitest';
import type { OrderRepository } from '@/orders/domain/ports/order.repository';
import { SummarizeLedgerService } from '@/orders/domain/services/summarize-ledger.service';
import { GetPortfolioUseCase } from '@/portfolio/application/use-cases/get-portfolio.use-case';
import type { InstrumentQuoteRepository } from '@/portfolio/domain/ports/instrument-quote.repository';
import { BuildPortfolioService } from '@/portfolio/domain/services/build-portfolio.service';
import type { UnitOfWork } from '@/shared/application/unit-of-work.port';

const USER_ID = 1;

describe('run', () => {
  it('should read the portfolio in a read-only repeatable-read transaction', async () => {
    const uow: UnitOfWork = { run: (work) => work() };
    const run = vi.spyOn(uow, 'run');
    const orders: Mocked<OrderRepository> = {
      lockLedger: vi.fn(),
      searchByUser: vi.fn().mockResolvedValue([]),
      findByIdForUser: vi.fn(),
      save: vi.fn(),
    };
    const quotes: Mocked<InstrumentQuoteRepository> = {
      searchByInstrumentIds: vi.fn().mockResolvedValue([]),
    };
    const useCase = new GetPortfolioUseCase(
      uow,
      orders,
      quotes,
      new SummarizeLedgerService(),
      new BuildPortfolioService(),
    );

    await useCase.run({ userId: USER_ID });

    expect(run).toHaveBeenCalledWith(expect.any(Function), {
      isolation: 'repeatable-read',
      readOnly: true,
    });
  });
});
