import Decimal from 'decimal.js';
import type { LedgerEntry } from '@/orders/domain/services/summarize-ledger.service';

const ARS_INSTRUMENT_ID = 66;

interface PlacedAtParams {
  entry: LedgerEntry;
  id: number;
  isoDatetime: string;
}

interface TradeParams {
  instrumentId: number;
  size: number;
  price: string;
}

export class LedgerEntryMother {
  public static create(overrides?: Partial<LedgerEntry>): LedgerEntry {
    return {
      id: 1,
      instrumentId: 47,
      side: 'BUY',
      status: 'FILLED',
      size: 1,
      price: new Decimal('1'),
      datetime: new Date('2023-07-12T12:00:00Z'),
      ...overrides,
    };
  }

  public static placedAt(params: PlacedAtParams): LedgerEntry {
    const { entry, id, isoDatetime } = params;

    return { ...entry, id, datetime: new Date(isoDatetime) };
  }

  public static filledCashIn(amount: number): LedgerEntry {
    return this.create({
      instrumentId: ARS_INSTRUMENT_ID,
      side: 'CASH_IN',
      status: 'FILLED',
      size: amount,
      price: new Decimal('1'),
    });
  }

  public static filledBuy(params: TradeParams): LedgerEntry {
    const { instrumentId, size, price } = params;

    return this.create({
      instrumentId,
      side: 'BUY',
      status: 'FILLED',
      size,
      price: new Decimal(price),
    });
  }

  public static filledSell(params: TradeParams): LedgerEntry {
    const { instrumentId, size, price } = params;

    return this.create({
      instrumentId,
      side: 'SELL',
      status: 'FILLED',
      size,
      price: new Decimal(price),
    });
  }

  public static newBuy(params: TradeParams): LedgerEntry {
    const { instrumentId, size, price } = params;

    return this.create({
      instrumentId,
      side: 'BUY',
      status: 'NEW',
      size,
      price: new Decimal(price),
    });
  }

  public static newSell(params: TradeParams): LedgerEntry {
    const { instrumentId, size, price } = params;

    return this.create({
      instrumentId,
      side: 'SELL',
      status: 'NEW',
      size,
      price: new Decimal(price),
    });
  }

  public static newCashIn(amount: number): LedgerEntry {
    return { ...this.filledCashIn(amount), status: 'NEW' };
  }

  public static newCashOut(amount: number): LedgerEntry {
    return { ...this.filledCashOut(amount), status: 'NEW' };
  }

  public static filledCashOut(amount: number): LedgerEntry {
    return this.create({
      instrumentId: ARS_INSTRUMENT_ID,
      side: 'CASH_OUT',
      status: 'FILLED',
      size: amount,
      price: new Decimal('1'),
    });
  }
}
