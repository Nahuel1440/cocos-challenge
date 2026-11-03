import { Inject, Injectable } from '@nestjs/common';
import type Decimal from 'decimal.js';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@/orders/domain/ports/order.repository';
import {
  LEDGER_STATUSES,
  SummarizeLedgerService,
} from '@/orders/domain/services/summarize-ledger.service';
import {
  INSTRUMENT_QUOTE_REPOSITORY,
  type InstrumentQuote,
  type InstrumentQuoteRepository,
} from '@/portfolio/domain/ports/instrument-quote.repository';
import {
  BuildPortfolioService,
  type PortfolioPosition,
} from '@/portfolio/domain/services/build-portfolio.service';

export interface GetPortfolioInput {
  userId: number;
}

export interface PositionView extends PortfolioPosition {
  ticker: string;
  name: string;
}

export interface PortfolioView {
  totalValue: Decimal;
  availableCash: Decimal;
  positions: PositionView[];
}

@Injectable()
export class GetPortfolioUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(INSTRUMENT_QUOTE_REPOSITORY)
    private readonly quotes: InstrumentQuoteRepository,
    private readonly summarizeLedger: SummarizeLedgerService,
    private readonly buildPortfolio: BuildPortfolioService,
  ) {}

  public async run(input: GetPortfolioInput): Promise<PortfolioView> {
    const { userId } = input;

    const entries = await this.orders.searchByUser({
      userId,
      statuses: LEDGER_STATUSES,
    });
    const summary = this.summarizeLedger.run(entries);

    const quotes = await this.quotes.searchByInstrumentIds([
      ...summary.holdings.keys(),
    ]);
    const portfolio = this.buildPortfolio.run({
      summary,
      latestPrices: this.latestPrices(quotes),
    });

    const quoteById = new Map(
      quotes.map((quote) => [quote.instrumentId, quote]),
    );

    return {
      totalValue: portfolio.totalValue,
      availableCash: summary.availableCash,
      positions: portfolio.positions.map((position) => {
        // Every held instrument id was sent to the quote query, and orders.instrumentid has a foreign key to instruments.
        const { ticker, name } = quoteById.get(position.instrumentId)!;

        return { ...position, ticker, name };
      }),
    };
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
