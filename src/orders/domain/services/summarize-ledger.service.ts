import Decimal from 'decimal.js';

export type LedgerSide = 'BUY' | 'SELL' | 'CASH_IN' | 'CASH_OUT';
export type LedgerStatus = 'FILLED' | 'NEW';
export const LEDGER_STATUSES: LedgerStatus[] = ['FILLED', 'NEW'];

export interface LedgerEntry {
  id: number;
  instrumentId: number;
  side: LedgerSide;
  status: LedgerStatus;
  size: number;
  price: Decimal;
  datetime: Date;
}

export interface Holding {
  quantity: number;
  availableQuantity: number;
  averagePrice: Decimal | null;
}

export interface LedgerSummary {
  totalCash: Decimal;
  availableCash: Decimal;
  holdings: ReadonlyMap<number, Holding>;
}

const EMPTY_HOLDING: Holding = {
  quantity: 0,
  availableQuantity: 0,
  averagePrice: null,
};

interface LedgerState {
  totalCash: Decimal;
  reservedCash: Decimal;
  holdings: Map<number, Holding>;
  reservedShares: Map<number, number>;
}

interface ApplyEntryParams {
  state: LedgerState;
  entry: LedgerEntry;
}

interface SettleTradeParams {
  state: LedgerState;
  entry: LedgerEntry;
  amount: Decimal;
}

interface AverageAfterBuyParams {
  held: Holding;
  entry: LedgerEntry;
  quantity: number;
}

export class SummarizeLedgerService {
  public run(entries: LedgerEntry[]): LedgerSummary {
    const state: LedgerState = {
      totalCash: new Decimal(0),
      reservedCash: new Decimal(0),
      holdings: new Map(),
      reservedShares: new Map(),
    };
    const replayOrder = [...entries].sort(
      (a, b) => a.datetime.getTime() - b.datetime.getTime() || a.id - b.id,
    );

    for (const entry of replayOrder) {
      if (entry.status === 'NEW') this.reserve({ state, entry });
      else this.settle({ state, entry });
    }

    return {
      totalCash: state.totalCash,
      availableCash: state.totalCash.minus(state.reservedCash),
      holdings: this.withAvailableQuantity(state),
    };
  }

  private reserve(params: ApplyEntryParams): void {
    const { state, entry } = params;

    if (entry.side === 'BUY') {
      state.reservedCash = state.reservedCash.plus(
        entry.price.times(entry.size),
      );
    }
    if (entry.side === 'SELL') {
      const reserved = state.reservedShares.get(entry.instrumentId) ?? 0;
      state.reservedShares.set(entry.instrumentId, reserved + entry.size);
    }
  }

  private settle(params: ApplyEntryParams): void {
    const { state, entry } = params;
    const amount = entry.price.times(entry.size);

    if (entry.side === 'CASH_IN')
      state.totalCash = state.totalCash.plus(amount);
    if (entry.side === 'CASH_OUT')
      state.totalCash = state.totalCash.minus(amount);
    if (entry.side === 'BUY') this.settleBuy({ state, entry, amount });
    if (entry.side === 'SELL') this.settleSell({ state, entry, amount });
  }

  private settleBuy(params: SettleTradeParams): void {
    const { state, entry, amount } = params;

    state.totalCash = state.totalCash.minus(amount);

    const held = state.holdings.get(entry.instrumentId) ?? EMPTY_HOLDING;
    const quantity = held.quantity + entry.size;
    const averagePrice = this.averageAfterBuy({ held, entry, quantity });
    state.holdings.set(entry.instrumentId, { ...held, quantity, averagePrice });
  }

  private averageAfterBuy(params: AverageAfterBuyParams): Decimal | null {
    const { held, entry, quantity } = params;
    const positionIsClosed = quantity <= 0;
    const { averagePrice } = held;

    if (positionIsClosed) return null;
    if (averagePrice === null) return entry.price;

    return averagePrice
      .times(held.quantity)
      .plus(entry.price.times(entry.size))
      .div(quantity);
  }

  private settleSell(params: SettleTradeParams): void {
    const { state, entry, amount } = params;

    state.totalCash = state.totalCash.plus(amount);

    const holding = state.holdings.get(entry.instrumentId) ?? EMPTY_HOLDING;
    const quantity = holding.quantity - entry.size;
    const averagePrice = quantity <= 0 ? null : holding.averagePrice;
    state.holdings.set(entry.instrumentId, {
      ...holding,
      quantity,
      averagePrice,
    });
  }

  private withAvailableQuantity(state: LedgerState): Map<number, Holding> {
    const holdings = new Map<number, Holding>();

    for (const [instrumentId, holding] of state.holdings) {
      const reserved = state.reservedShares.get(instrumentId) ?? 0;
      holdings.set(instrumentId, {
        ...holding,
        availableQuantity: holding.quantity - reserved,
      });
    }

    return holdings;
  }
}
