import Decimal from 'decimal.js';

export type LedgerSide = 'BUY' | 'SELL' | 'CASH_IN' | 'CASH_OUT';
export type LedgerStatus = 'FILLED' | 'NEW';

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

const CASH_SIGN: Record<LedgerSide, 1 | -1> = {
  CASH_IN: 1,
  SELL: 1,
  BUY: -1,
  CASH_OUT: -1,
};

interface Position {
  quantity: number;
  reservedQuantity: number;
  averagePrice: Decimal | null;
  held: boolean;
}

interface LedgerState {
  totalCash: Decimal;
  reservedCash: Decimal;
  positions: Map<number, Position>;
}

interface ApplyEntryParams {
  state: LedgerState;
  entry: LedgerEntry;
}

interface AverageAfterBuyParams {
  position: Position;
  entry: LedgerEntry;
  quantity: number;
}

function positionOf(state: LedgerState, instrumentId: number): Position {
  const known = state.positions.get(instrumentId);
  if (known) return known;

  const created: Position = {
    quantity: 0,
    reservedQuantity: 0,
    averagePrice: null,
    held: false,
  };
  state.positions.set(instrumentId, created);
  return created;
}

function holdPosition(state: LedgerState, instrumentId: number): Position {
  const position = positionOf(state, instrumentId);
  if (!position.held) {
    position.held = true;
    state.positions.delete(instrumentId);
    state.positions.set(instrumentId, position);
  }
  return position;
}

export class SummarizeLedgerService {
  public run(entries: LedgerEntry[]): LedgerSummary {
    const state: LedgerState = {
      totalCash: new Decimal(0),
      reservedCash: new Decimal(0),
      positions: new Map(),
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
      holdings: this.toHoldings(state),
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
      positionOf(state, entry.instrumentId).reservedQuantity += entry.size;
    }
  }

  private settle(params: ApplyEntryParams): void {
    const { state, entry } = params;
    const amount = entry.price.times(entry.size);

    state.totalCash = state.totalCash.plus(amount.times(CASH_SIGN[entry.side]));
    if (entry.side === 'BUY') this.settleBuy({ state, entry });
    if (entry.side === 'SELL') this.settleSell({ state, entry });
  }

  private settleBuy(params: ApplyEntryParams): void {
    const { state, entry } = params;
    const position = holdPosition(state, entry.instrumentId);
    const quantity = position.quantity + entry.size;

    position.averagePrice = this.averageAfterBuy({ position, entry, quantity });
    position.quantity = quantity;
  }

  private averageAfterBuy(params: AverageAfterBuyParams): Decimal | null {
    const { position, entry, quantity } = params;
    const positionIsClosed = quantity <= 0;
    const { averagePrice } = position;

    if (positionIsClosed) return null;
    if (averagePrice === null) return entry.price;

    return averagePrice
      .times(position.quantity)
      .plus(entry.price.times(entry.size))
      .div(quantity);
  }

  private settleSell(params: ApplyEntryParams): void {
    const { state, entry } = params;
    const position = holdPosition(state, entry.instrumentId);

    position.quantity -= entry.size;
    if (position.quantity <= 0) position.averagePrice = null;
  }

  private toHoldings(state: LedgerState): Map<number, Holding> {
    const holdings = new Map<number, Holding>();

    for (const [instrumentId, position] of state.positions) {
      if (!position.held) continue;
      holdings.set(instrumentId, {
        quantity: position.quantity,
        availableQuantity: position.quantity - position.reservedQuantity,
        averagePrice: position.averagePrice,
      });
    }

    return holdings;
  }
}
