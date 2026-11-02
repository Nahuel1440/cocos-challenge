import { Inject, Injectable } from '@nestjs/common';
import type Decimal from 'decimal.js';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@/orders/domain/ports/order.repository';
import {
  SummarizeLedgerService,
  type LedgerStatus,
} from '@/orders/domain/services/summarize-ledger.service';
import {
  INSTRUMENT_QUOTE_REPOSITORY,
  type InstrumentQuote,
  type InstrumentQuoteRepository,
} from '@/portfolio/domain/ports/instrument-quote.repository';
import { BuildPortfolioService } from '@/portfolio/domain/services/build-portfolio.service';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
  type UnitOfWorkOptions,
} from '@/shared/application/unit-of-work.port';

export interface GetPortfolioInput {
  userId: number;
}

export interface PositionView {
  instrumentId: number;
  ticker: string;
  name: string;
  quantity: number;
  averagePrice: Decimal | null;
  marketValue: Decimal | null;
  totalReturnPercentage: Decimal | null;
}

export interface PortfolioView {
  totalValue: Decimal;
  availableCash: Decimal;
  positions: PositionView[];
}

const LEDGER_STATUSES: LedgerStatus[] = ['FILLED', 'NEW'];
const SNAPSHOT_READ: UnitOfWorkOptions = {
  isolation: 'repeatable-read',
  readOnly: true,
};

@Injectable()
export class GetPortfolioUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(INSTRUMENT_QUOTE_REPOSITORY)
    private readonly quotes: InstrumentQuoteRepository,
    private readonly summarizeLedger: SummarizeLedgerService,
    private readonly buildPortfolio: BuildPortfolioService,
  ) {}

  public run(input: GetPortfolioInput): Promise<PortfolioView> {
    const { userId } = input;

    return this.uow.run(async () => {
      const entries = await this.orders.searchByUser({
        userId,
        statuses: LEDGER_STATUSES,
      });
      const summary = this.summarizeLedger.run(entries);
      const quotes = await this.quotes.searchByInstrumentIds([
        ...summary.holdings.keys(),
      ]);
      const quoteById = new Map(
        quotes.map((quote) => [quote.instrumentId, quote]),
      );
      const portfolio = this.buildPortfolio.run({
        summary,
        latestPrices: this.latestPrices(quotes),
      });

      return {
        totalValue: portfolio.totalValue,
        availableCash: summary.availableCash,
        positions: portfolio.positions.map((position) => {
          // Every held instrument id was sent to the quote query, and orders.instrumentid has a foreign key to instruments.
          const { ticker, name } = quoteById.get(position.instrumentId)!;

          return { ...position, ticker, name };
        }),
      };
    }, SNAPSHOT_READ);
  }

  private latestPrices(quotes: InstrumentQuote[]): Map<number, Decimal> {
    const prices = new Map<number, Decimal>();
    for (const quote of quotes) {
      if (quote.latestClose !== null) {
        prices.set(quote.instrumentId, quote.latestClose);
      }
    }

    return prices;
  }
}
