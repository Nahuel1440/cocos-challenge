import Decimal from 'decimal.js';
import type { LedgerSummary } from '@/orders/domain/services/summarize-ledger.service';

export interface PortfolioPosition {
  instrumentId: number;
  quantity: number;
  averagePrice: string | null;
  marketValue: string | null;
  totalReturnPercentage: string | null;
}

export interface Portfolio {
  totalValue: string;
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
      if (marketValue) totalValue = totalValue.plus(marketValue);

      positions.push({
        instrumentId,
        quantity: holding.quantity,
        averagePrice: holding.averagePrice
          ? this.round(holding.averagePrice)
          : null,
        marketValue: marketValue ? this.round(marketValue) : null,
        totalReturnPercentage:
          price && holding.averagePrice
            ? this.round(
                this.returnPercentage({
                  price,
                  averagePrice: holding.averagePrice,
                }),
              )
            : null,
      });
    }

    positions.sort((a, b) => a.instrumentId - b.instrumentId);

    return { totalValue: this.round(totalValue), positions };
  }

  private returnPercentage(params: ReturnPercentageParams): Decimal {
    const { price, averagePrice } = params;

    return price.minus(averagePrice).div(averagePrice).times(PERCENT);
  }

  private round(value: Decimal): string {
    return value.toFixed(2, Decimal.ROUND_HALF_UP);
  }
}
