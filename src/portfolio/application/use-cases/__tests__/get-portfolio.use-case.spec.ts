import Decimal from 'decimal.js';
import { describe, expect, it, type Mocked, vi } from 'vitest';
import type { OrderRepository } from '@/orders/domain/ports/order.repository';
import { LedgerEntryMother } from '@/orders/domain/services/__tests__/ledger-entry.mother';
import {
  LEDGER_STATUSES,
  SummarizeLedgerService,
} from '@/orders/domain/services/summarize-ledger.service';
import { GetPortfolioUseCase } from '@/portfolio/application/use-cases/get-portfolio.use-case';
import type { InstrumentQuoteRepository } from '@/portfolio/domain/ports/instrument-quote.repository';
import { BuildPortfolioService } from '@/portfolio/domain/services/build-portfolio.service';

const USER_ID = 1;

describe('run', () => {
  it('should read the whole ledger in one query', async () => {
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
      orders,
      quotes,
      new SummarizeLedgerService(),
      new BuildPortfolioService(),
    );

    await useCase.run({ userId: USER_ID });

    expect(orders.searchByUser).toHaveBeenCalledTimes(1);
  });

  it("should build the view from the user's ledger and quotes", async () => {
    const INSTRUMENT_ID = 47;
    const orders: Mocked<OrderRepository> = {
      lockLedger: vi.fn(),
      searchByUser: vi
        .fn()
        .mockResolvedValue([
          LedgerEntryMother.filledCashIn(100000),
          LedgerEntryMother.filledBuy({
            instrumentId: INSTRUMENT_ID,
            size: 10,
            price: '900',
          }),
        ]),
      findByIdForUser: vi.fn(),
      save: vi.fn(),
    };
    const quotes: Mocked<InstrumentQuoteRepository> = {
      searchByInstrumentIds: vi.fn().mockResolvedValue([
        {
          instrumentId: INSTRUMENT_ID,
          ticker: 'PAMP',
          name: 'Pampa Holding S.A.',
          latestClose: new Decimal('925.85'),
        },
      ]),
    };
    const useCase = new GetPortfolioUseCase(
      orders,
      quotes,
      new SummarizeLedgerService(),
      new BuildPortfolioService(),
    );

    const view = await useCase.run({ userId: USER_ID });

    expect(orders.searchByUser).toHaveBeenCalledWith({
      userId: USER_ID,
      statuses: LEDGER_STATUSES,
    });
    expect(quotes.searchByInstrumentIds).toHaveBeenCalledWith([INSTRUMENT_ID]);
    expect(view.availableCash.toString()).toBe('91000');
    expect(view.totalValue.toString()).toBe('100258.5');
    expect(view.positions).toHaveLength(1);
    const [position] = view.positions;
    expect(position).toMatchObject({
      instrumentId: INSTRUMENT_ID,
      ticker: 'PAMP',
      name: 'Pampa Holding S.A.',
      quantity: 10,
    });
    expect(position!.marketValue!.toString()).toBe('9258.5');
  });
});
