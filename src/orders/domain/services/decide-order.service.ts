import Decimal from 'decimal.js';
import type { LedgerSummary } from '@/orders/domain/services/summarize-ledger.service';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type OrderOutcome = 'FILLED' | 'NEW' | 'REJECTED';
export type RejectionReason =
  | 'INSUFFICIENT_FUNDS'
  | 'INSUFFICIENT_SHARES'
  | 'AMOUNT_BELOW_ONE_SHARE'
  | 'NO_MARKET_PRICE';

export interface OrderInput {
  instrumentId: number;
  side: OrderSide;
  type: OrderType;
  size: number | null;
  amount: Decimal | null;
  limitPrice: Decimal | null;
}

export interface OrderDecision {
  status: OrderOutcome;
  rejectionReason: RejectionReason | null;
  price: Decimal | null;
  size: number | null;
}

export interface DecideOrderParams {
  input: OrderInput;
  summary: LedgerSummary;
  marketPrice: Decimal | null;
}

interface RejectParams {
  reason: RejectionReason;
  price: Decimal | null;
  size: number | null;
}

interface ResolveSizeParams {
  input: OrderInput;
  price: Decimal;
}

interface SizedOrderParams {
  input: OrderInput;
  summary: LedgerSummary;
  price: Decimal;
  size: number;
}

export class DecideOrderService {
  public run(params: DecideOrderParams): OrderDecision {
    const { input, summary, marketPrice } = params;
    const price = input.type === 'LIMIT' ? input.limitPrice : marketPrice;

    if (price === null) {
      return this.reject({
        reason: 'NO_MARKET_PRICE',
        price,
        size: input.size,
      });
    }

    const size = this.resolveSize({ input, price });
    const rejection = this.findRejection({ input, summary, price, size });

    if (rejection !== null)
      return this.reject({ reason: rejection, price, size });

    return {
      status: input.type === 'LIMIT' ? 'NEW' : 'FILLED',
      rejectionReason: null,
      price,
      size,
    };
  }

  private reject(params: RejectParams): OrderDecision {
    const { reason, price, size } = params;

    return { status: 'REJECTED', rejectionReason: reason, price, size };
  }

  private resolveSize(params: ResolveSizeParams): number {
    const { input, price } = params;

    if (input.size !== null) return input.size;

    return (input.amount ?? new Decimal(0)).divToInt(price).toNumber();
  }

  private findRejection(params: SizedOrderParams): RejectionReason | null {
    const { input, size } = params;

    if (input.type === 'MARKET' && input.amount !== null && size === 0) {
      return 'AMOUNT_BELOW_ONE_SHARE';
    }
    if (input.side === 'BUY' && this.exceedsAvailableCash(params)) {
      return 'INSUFFICIENT_FUNDS';
    }
    if (input.side === 'SELL' && this.exceedsAvailableShares(params)) {
      return 'INSUFFICIENT_SHARES';
    }

    return null;
  }

  private exceedsAvailableCash(params: SizedOrderParams): boolean {
    const { summary, price, size } = params;

    return price.times(size).greaterThan(summary.availableCash);
  }

  private exceedsAvailableShares(params: SizedOrderParams): boolean {
    const { input, summary, size } = params;
    const available =
      summary.holdings.get(input.instrumentId)?.availableQuantity ?? 0;

    return size > available;
  }
}
