import Decimal from 'decimal.js';
import type { LedgerSummary } from '@/orders/domain/services/summarize-ledger.service';

export interface PortfolioPosition {
  instrumentId: number;
  quantity: number;
  averagePrice: Decimal | null;
  marketValue: Decimal | null;
  totalReturnPercentage: Decimal | null;
}

export interface Portfolio {
  totalValue: Decimal;
  positions: PortfolioPosition[];
}

export interface BuildPortfolioParams {
  summary: LedgerSummary;
  latestPrices: ReadonlyMap<number, Decimal>;
}

interface ReturnPercentageParams {
  price: Decimal;
  averagePrice: Decimal;
}

const PERCENT = 100;

export class BuildPortfolioService {
  public run(params: BuildPortfolioParams): Portfolio {
    const { summary, latestPrices } = params;
    const positions: PortfolioPosition[] = [];
    let totalValue = summary.totalCash;

    for (const [instrumentId, holding] of summary.holdings) {
      if (holding.quantity === 0) continue;

      const price = latestPrices.get(instrumentId);
      const marketValue = price?.times(holding.quantity);
      const { averagePrice } = holding;
      const hasReturn = price !== undefined && averagePrice !== null;
      if (marketValue !== undefined) totalValue = totalValue.plus(marketValue);

      positions.push({
        instrumentId,
        quantity: holding.quantity,
        averagePrice,
        marketValue: marketValue ?? null,
        totalReturnPercentage: hasReturn
          ? this.returnPercentage({ price, averagePrice })
          : null,
      });
    }

    positions.sort((a, b) => a.instrumentId - b.instrumentId);

    return { totalValue, positions };
  }

  private returnPercentage(params: ReturnPercentageParams): Decimal {
    const { price, averagePrice } = params;

    return price.minus(averagePrice).div(averagePrice).times(PERCENT);
  }
}
