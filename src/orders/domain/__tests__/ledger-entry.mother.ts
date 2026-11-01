import Decimal from 'decimal.js';
import type { LedgerEntry } from '@/orders/domain/summarize-ledger';

const ARS_INSTRUMENT_ID = 66;

export class LedgerEntryMother {
  static create(overrides?: Partial<LedgerEntry>): LedgerEntry {
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

  static placedAt(
    entry: LedgerEntry,
    id: number,
    isoDatetime: string,
  ): LedgerEntry {
    return { ...entry, id, datetime: new Date(isoDatetime) };
  }

  static filledCashIn(amount: number): LedgerEntry {
    return this.create({
      instrumentId: ARS_INSTRUMENT_ID,
      side: 'CASH_IN',
      status: 'FILLED',
      size: amount,
      price: new Decimal('1'),
    });
  }

  static filledBuy(
    instrumentId: number,
    size: number,
    price: string,
  ): LedgerEntry {
    return this.create({
      instrumentId,
      side: 'BUY',
      status: 'FILLED',
      size,
      price: new Decimal(price),
    });
  }

  static filledSell(
    instrumentId: number,
    size: number,
    price: string,
  ): LedgerEntry {
    return this.create({
      instrumentId,
      side: 'SELL',
      status: 'FILLED',
      size,
      price: new Decimal(price),
    });
  }

  static newBuy(
    instrumentId: number,
    size: number,
    price: string,
  ): LedgerEntry {
    return this.create({
      instrumentId,
      side: 'BUY',
      status: 'NEW',
      size,
      price: new Decimal(price),
    });
  }

  static newSell(
    instrumentId: number,
    size: number,
    price: string,
  ): LedgerEntry {
    return this.create({
      instrumentId,
      side: 'SELL',
      status: 'NEW',
      size,
      price: new Decimal(price),
    });
  }

  static newCashIn(amount: number): LedgerEntry {
    return { ...this.filledCashIn(amount), status: 'NEW' };
  }

  static newCashOut(amount: number): LedgerEntry {
    return { ...this.filledCashOut(amount), status: 'NEW' };
  }

  static filledCashOut(amount: number): LedgerEntry {
    return this.create({
      instrumentId: ARS_INSTRUMENT_ID,
      side: 'CASH_OUT',
      status: 'FILLED',
      size: amount,
      price: new Decimal('1'),
    });
  }
}
