import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { LedgerEntryMother } from '@/orders/domain/services/__tests__/ledger-entry.mother';
import {
  SummarizeLedgerService,
  type LedgerEntry,
} from '@/orders/domain/services/summarize-ledger.service';

const summarizeLedger = new SummarizeLedgerService();

describe('run', () => {
  it('should return zero cash and no holdings when there are no entries', () => {
    const NO_ENTRIES: LedgerEntry[] = [];

    const summary = summarizeLedger.run(NO_ENTRIES);

    expect(summary.totalCash.equals(new Decimal('0'))).toBe(true);
    expect(summary.availableCash.equals(new Decimal('0'))).toBe(true);
    expect(summary.holdings.size).toBe(0);
  });

  it('should sum FILLED CASH_IN and CASH_OUT into total cash without creating a holding', () => {
    const TRANSFERS = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.filledCashOut(300),
    ];
    const EXPECTED_TOTAL_CASH = new Decimal('700');

    const summary = summarizeLedger.run(TRANSFERS);

    expect(summary.totalCash.equals(EXPECTED_TOTAL_CASH)).toBe(true);
    expect(summary.holdings.size).toBe(0);
  });

  it('should lower cash and create a holding on a FILLED BUY', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 2,
        price: '100',
      }),
    ];
    const EXPECTED_TOTAL_CASH = new Decimal('800');

    const summary = summarizeLedger.run(ENTRIES);

    expect(summary.totalCash.equals(EXPECTED_TOTAL_CASH)).toBe(true);
    expect(summary.holdings.get(PAMP_ID)?.quantity).toBe(2);
  });

  it('should raise cash, lower the holding and keep the average on a FILLED SELL', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 10,
        price: '100',
      }),
      LedgerEntryMother.filledSell({
        instrumentId: PAMP_ID,
        size: 4,
        price: '120',
      }),
    ];
    const EXPECTED_TOTAL_CASH = new Decimal('480');
    const EXPECTED_AVERAGE = new Decimal('100');

    const summary = summarizeLedger.run(ENTRIES);

    const holding = summary.holdings.get(PAMP_ID);
    expect(summary.totalCash.equals(EXPECTED_TOTAL_CASH)).toBe(true);
    expect(holding?.quantity).toBe(6);
    expect(holding?.averagePrice?.equals(EXPECTED_AVERAGE)).toBe(true);
  });

  it('should lower availableCash but not totalCash or holdings on a NEW BUY', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.newBuy({
        instrumentId: PAMP_ID,
        size: 3,
        price: '100',
      }),
    ];
    const EXPECTED_TOTAL_CASH = new Decimal('1000');
    const EXPECTED_AVAILABLE_CASH = new Decimal('700');

    const summary = summarizeLedger.run(ENTRIES);

    expect(summary.totalCash.equals(EXPECTED_TOTAL_CASH)).toBe(true);
    expect(summary.availableCash.equals(EXPECTED_AVAILABLE_CASH)).toBe(true);
    expect(summary.holdings.size).toBe(0);
  });

  it('should lower availableQuantity but not quantity on a NEW SELL', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 10,
        price: '100',
      }),
      LedgerEntryMother.newSell({
        instrumentId: PAMP_ID,
        size: 4,
        price: '150',
      }),
    ];

    const summary = summarizeLedger.run(ENTRIES);

    const holding = summary.holdings.get(PAMP_ID);
    expect(holding?.quantity).toBe(10);
    expect(holding?.availableQuantity).toBe(6);
  });

  it('should not list a holding for a NEW SELL on an instrument with no holding', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.newSell({
        instrumentId: PAMP_ID,
        size: 4,
        price: '150',
      }),
    ];

    const summary = summarizeLedger.run(ENTRIES);

    expect(summary.holdings.size).toBe(0);
  });

  it('should recompute the moving average on a second BUY', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(10000),
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 10,
        price: '100',
      }),
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 10,
        price: '200',
      }),
    ];
    const EXPECTED_AVERAGE = new Decimal('150');

    const summary = summarizeLedger.run(ENTRIES);

    const holding = summary.holdings.get(PAMP_ID);
    expect(holding?.quantity).toBe(20);
    expect(holding?.averagePrice?.equals(EXPECTED_AVERAGE)).toBe(true);
  });

  it('should set the average to null when a SELL leaves the holding at exactly 0', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 10,
        price: '100',
      }),
      LedgerEntryMother.filledSell({
        instrumentId: PAMP_ID,
        size: 10,
        price: '120',
      }),
    ];

    const summary = summarizeLedger.run(ENTRIES);

    const holding = summary.holdings.get(PAMP_ID);
    expect(holding?.quantity).toBe(0);
    expect(holding?.averagePrice).toBeNull();
  });

  it('should keep a negative quantity and a null average when a SELL goes below 0', () => {
    const INSTRUMENT_31 = 31;
    const ENTRIES = [
      LedgerEntryMother.filledBuy({
        instrumentId: INSTRUMENT_31,
        size: 20,
        price: '1540',
      }),
      LedgerEntryMother.filledSell({
        instrumentId: INSTRUMENT_31,
        size: 30,
        price: '1530',
      }),
    ];

    const summary = summarizeLedger.run(ENTRIES);

    const holding = summary.holdings.get(INSTRUMENT_31);
    expect(holding?.quantity).toBe(-10);
    expect(holding?.averagePrice).toBeNull();
  });

  it('should keep a negative quantity and a null average when a SELL has no earlier BUY', () => {
    const INSTRUMENT_31 = 31;
    const ENTRIES = [
      LedgerEntryMother.filledSell({
        instrumentId: INSTRUMENT_31,
        size: 3,
        price: '10',
      }),
    ];
    const EXPECTED_TOTAL_CASH = new Decimal('30');

    const summary = summarizeLedger.run(ENTRIES);

    const holding = summary.holdings.get(INSTRUMENT_31);
    expect(summary.totalCash.equals(EXPECTED_TOTAL_CASH)).toBe(true);
    expect(holding?.quantity).toBe(-3);
    expect(holding?.averagePrice).toBeNull();
  });

  it('should use the price of the BUY as the average when buying back from 0 or below', () => {
    const INSTRUMENT_31 = 31;
    const ENTRIES = [
      LedgerEntryMother.filledBuy({
        instrumentId: INSTRUMENT_31,
        size: 20,
        price: '1540',
      }),
      LedgerEntryMother.filledSell({
        instrumentId: INSTRUMENT_31,
        size: 30,
        price: '1530',
      }),
      LedgerEntryMother.filledBuy({
        instrumentId: INSTRUMENT_31,
        size: 15,
        price: '1600',
      }),
    ];
    const EXPECTED_AVERAGE = new Decimal('1600');

    const summary = summarizeLedger.run(ENTRIES);

    const holding = summary.holdings.get(INSTRUMENT_31);
    expect(holding?.quantity).toBe(5);
    expect(holding?.averagePrice?.equals(EXPECTED_AVERAGE)).toBe(true);
  });

  it('should not round the average price', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 1,
        price: '33.33',
      }),
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 1,
        price: '33.33',
      }),
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 1,
        price: '33.34',
      }),
    ];
    const EXPECTED_AVERAGE_TEN_DECIMALS = '33.3333333333';

    const summary = summarizeLedger.run(ENTRIES);

    const holding = summary.holdings.get(PAMP_ID);
    expect(holding?.averagePrice?.toFixed(10)).toBe(
      EXPECTED_AVERAGE_TEN_DECIMALS,
    );
  });

  it('should replay entries by datetime regardless of input order', () => {
    const PAMP_ID = 47;
    const FIRST_BUY = LedgerEntryMother.placedAt({
      entry: LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 10,
        price: '100',
      }),
      id: 1,
      isoDatetime: '2023-07-12T10:00:00Z',
    });
    const SELL = LedgerEntryMother.placedAt({
      entry: LedgerEntryMother.filledSell({
        instrumentId: PAMP_ID,
        size: 10,
        price: '110',
      }),
      id: 2,
      isoDatetime: '2023-07-12T11:00:00Z',
    });
    const SECOND_BUY = LedgerEntryMother.placedAt({
      entry: LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 10,
        price: '200',
      }),
      id: 3,
      isoDatetime: '2023-07-12T12:00:00Z',
    });
    const REVERSED_ENTRIES = [SECOND_BUY, SELL, FIRST_BUY];
    const EXPECTED_AVERAGE = new Decimal('200');

    const summary = summarizeLedger.run(REVERSED_ENTRIES);

    const holding = summary.holdings.get(PAMP_ID);
    expect(holding?.quantity).toBe(10);
    expect(holding?.averagePrice?.equals(EXPECTED_AVERAGE)).toBe(true);
  });

  it('should break a datetime tie by id ascending', () => {
    const PAMP_ID = 47;
    const SAME_INSTANT = '2023-07-12T10:00:00Z';
    const FIRST_BUY = LedgerEntryMother.placedAt({
      entry: LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 10,
        price: '100',
      }),
      id: 1,
      isoDatetime: SAME_INSTANT,
    });
    const SELL = LedgerEntryMother.placedAt({
      entry: LedgerEntryMother.filledSell({
        instrumentId: PAMP_ID,
        size: 10,
        price: '110',
      }),
      id: 2,
      isoDatetime: SAME_INSTANT,
    });
    const SECOND_BUY = LedgerEntryMother.placedAt({
      entry: LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 10,
        price: '200',
      }),
      id: 3,
      isoDatetime: SAME_INSTANT,
    });
    const REVERSED_ENTRIES = [SECOND_BUY, SELL, FIRST_BUY];
    const EXPECTED_AVERAGE = new Decimal('200');

    const summary = summarizeLedger.run(REVERSED_ENTRIES);

    expect(
      summary.holdings.get(PAMP_ID)?.averagePrice?.equals(EXPECTED_AVERAGE),
    ).toBe(true);
  });

  it('should ignore NEW CASH_IN and CASH_OUT', () => {
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.newCashIn(500),
      LedgerEntryMother.newCashOut(200),
    ];
    const EXPECTED_CASH = new Decimal('1000');

    const summary = summarizeLedger.run(ENTRIES);

    expect(summary.totalCash.equals(EXPECTED_CASH)).toBe(true);
    expect(summary.availableCash.equals(EXPECTED_CASH)).toBe(true);
    expect(summary.holdings.size).toBe(0);
  });
});
