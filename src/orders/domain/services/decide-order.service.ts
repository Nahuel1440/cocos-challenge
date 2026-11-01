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

interface PricedOrderParams {
  input: OrderInput;
  summary: LedgerSummary;
  price: Decimal | null;
}

export class DecideOrderService {
  public run(params: DecideOrderParams): OrderDecision {
    const { input, summary, marketPrice } = params;
    const price = input.type === 'LIMIT' ? input.limitPrice : marketPrice;
    const { size } = input;
    const rejectionReason = this.findRejection({ input, summary, price });

    if (rejectionReason !== null) {
      return { status: 'REJECTED', rejectionReason, price, size };
    }

    return {
      status: input.type === 'LIMIT' ? 'NEW' : 'FILLED',
      rejectionReason: null,
      price,
      size,
    };
  }

  private findRejection(params: PricedOrderParams): RejectionReason | null {
    const { input } = params;

    if (input.side === 'BUY' && this.exceedsAvailableCash(params)) {
      return 'INSUFFICIENT_FUNDS';
    }
    if (input.side === 'SELL' && this.exceedsAvailableShares(params)) {
      return 'INSUFFICIENT_SHARES';
    }

    return null;
  }

  private exceedsAvailableCash(params: PricedOrderParams): boolean {
    const { input, summary, price } = params;

    if (price === null || input.size === null) return false;

    return price.times(input.size).greaterThan(summary.availableCash);
  }

  private exceedsAvailableShares(params: PricedOrderParams): boolean {
    const { input, summary } = params;
    const available =
      summary.holdings.get(input.instrumentId)?.availableQuantity ?? 0;

    return (input.size ?? 0) > available;
  }
}
