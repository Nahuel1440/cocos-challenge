import type Decimal from 'decimal.js';
import type {
  PortfolioView,
  PositionView,
} from '@/portfolio/application/use-cases/get-portfolio.use-case';
import { toDecimalString } from '@/shared/infrastructure/http/to-decimal-string';

export interface PositionBody {
  instrumentId: number;
  ticker: string;
  name: string;
  quantity: number;
  marketValue: string | null;
  averagePrice: string | null;
  totalReturnPercentage: string | null;
}

export interface PortfolioBody {
  totalValue: string;
  availableCash: string;
  positions: PositionBody[];
}

export class PortfolioPresenter {
  public static present(view: PortfolioView): PortfolioBody {
    return {
      totalValue: toDecimalString(view.totalValue),
      availableCash: toDecimalString(view.availableCash),
      positions: view.positions.map((position) =>
        PortfolioPresenter.presentPosition(position),
      ),
    };
  }

  private static presentPosition(position: PositionView): PositionBody {
    return {
      instrumentId: position.instrumentId,
      ticker: position.ticker,
      name: position.name,
      quantity: position.quantity,
      marketValue: PortfolioPresenter.optionalString(position.marketValue),
      averagePrice: PortfolioPresenter.optionalString(position.averagePrice),
      totalReturnPercentage: PortfolioPresenter.optionalString(
        position.totalReturnPercentage,
      ),
    };
  }

  private static optionalString(value: Decimal | null): string | null {
    return value === null ? null : toDecimalString(value);
  }
}
