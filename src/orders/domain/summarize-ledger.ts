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

export function summarizeLedger(entries: LedgerEntry[]): LedgerSummary {
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
    if (entry.status === 'NEW') reserve(state, entry);
    else settle(state, entry);
  }
  return {
    totalCash: state.totalCash,
    availableCash: state.totalCash.minus(state.reservedCash),
    holdings: withAvailableQuantity(state),
  };
}

function reserve(state: LedgerState, entry: LedgerEntry): void {
  if (entry.side === 'BUY') {
    state.reservedCash = state.reservedCash.plus(entry.price.times(entry.size));
  }
  if (entry.side === 'SELL') {
    const reserved = state.reservedShares.get(entry.instrumentId) ?? 0;
    state.reservedShares.set(entry.instrumentId, reserved + entry.size);
  }
}

function settle(state: LedgerState, entry: LedgerEntry): void {
  const amount = entry.price.times(entry.size);
  if (entry.side === 'CASH_IN') state.totalCash = state.totalCash.plus(amount);
  if (entry.side === 'CASH_OUT')
    state.totalCash = state.totalCash.minus(amount);
  if (entry.side === 'BUY') settleBuy(state, entry, amount);
  if (entry.side === 'SELL') settleSell(state, entry, amount);
}

function settleBuy(
  state: LedgerState,
  entry: LedgerEntry,
  amount: Decimal,
): void {
  state.totalCash = state.totalCash.minus(amount);
  const held = state.holdings.get(entry.instrumentId) ?? EMPTY_HOLDING;
  const quantity = held.quantity + entry.size;
  const averagePrice = averageAfterBuy(held, entry, quantity);
  state.holdings.set(entry.instrumentId, { ...held, quantity, averagePrice });
}

function averageAfterBuy(
  held: Holding,
  entry: LedgerEntry,
  quantity: number,
): Decimal | null {
  if (quantity <= 0) return null;
  if (held.averagePrice === null) return entry.price;
  return held.averagePrice
    .times(held.quantity)
    .plus(entry.price.times(entry.size))
    .div(quantity);
}

function settleSell(
  state: LedgerState,
  entry: LedgerEntry,
  amount: Decimal,
): void {
  state.totalCash = state.totalCash.plus(amount);
  const holding = state.holdings.get(entry.instrumentId)!;
  const quantity = holding.quantity - entry.size;
  const averagePrice = quantity <= 0 ? null : holding.averagePrice;
  state.holdings.set(entry.instrumentId, {
    ...holding,
    quantity,
    averagePrice,
  });
}

function withAvailableQuantity(state: LedgerState): Map<number, Holding> {
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
