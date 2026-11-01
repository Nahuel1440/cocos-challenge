import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { LedgerEntryMother } from '@/orders/domain/services/__tests__/ledger-entry.mother';
import {
  LedgerService,
  type LedgerEntry,
} from '@/orders/domain/services/ledger.service';

const ledger = new LedgerService();

describe('summarize', () => {
  it('should return zero cash and no holdings when there are no entries', () => {
    // Arrange
    const NO_ENTRIES: LedgerEntry[] = [];

    // Act
    const summary = ledger.summarize(NO_ENTRIES);

    // Assert
    expect(summary.totalCash.equals(new Decimal('0'))).toBe(true);
    expect(summary.availableCash.equals(new Decimal('0'))).toBe(true);
    expect(summary.holdings.size).toBe(0);
  });

  it('should sum FILLED CASH_IN and CASH_OUT into total cash without creating a holding', () => {
    // Arrange
    const TRANSFERS = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.filledCashOut(300),
    ];
    const EXPECTED_TOTAL_CASH = new Decimal('700');

    // Act
    const summary = ledger.summarize(TRANSFERS);

    // Assert
    expect(summary.totalCash.equals(EXPECTED_TOTAL_CASH)).toBe(true);
    expect(summary.holdings.size).toBe(0);
  });

  it('should lower cash and create a holding on a FILLED BUY', () => {
    // Arrange
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.filledBuy(PAMP_ID, 2, '100'),
    ];
    const EXPECTED_TOTAL_CASH = new Decimal('800');

    // Act
    const summary = ledger.summarize(ENTRIES);

    // Assert
    expect(summary.totalCash.equals(EXPECTED_TOTAL_CASH)).toBe(true);
    expect(summary.holdings.get(PAMP_ID)?.quantity).toBe(2);
  });

  it('should raise cash, lower the holding and keep the average on a FILLED SELL', () => {
    // Arrange
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.filledBuy(PAMP_ID, 10, '100'),
      LedgerEntryMother.filledSell(PAMP_ID, 4, '120'),
    ];
    const EXPECTED_TOTAL_CASH = new Decimal('480');
    const EXPECTED_AVERAGE = new Decimal('100');

    // Act
    const summary = ledger.summarize(ENTRIES);

    // Assert
    const holding = summary.holdings.get(PAMP_ID);
    expect(summary.totalCash.equals(EXPECTED_TOTAL_CASH)).toBe(true);
    expect(holding?.quantity).toBe(6);
    expect(holding?.averagePrice?.equals(EXPECTED_AVERAGE)).toBe(true);
  });

  it('should lower availableCash but not totalCash or holdings on a NEW BUY', () => {
    // Arrange
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.newBuy(PAMP_ID, 3, '100'),
    ];
    const EXPECTED_TOTAL_CASH = new Decimal('1000');
    const EXPECTED_AVAILABLE_CASH = new Decimal('700');

    // Act
    const summary = ledger.summarize(ENTRIES);

    // Assert
    expect(summary.totalCash.equals(EXPECTED_TOTAL_CASH)).toBe(true);
    expect(summary.availableCash.equals(EXPECTED_AVAILABLE_CASH)).toBe(true);
    expect(summary.holdings.size).toBe(0);
  });

  it('should lower availableQuantity but not quantity on a NEW SELL', () => {
    // Arrange
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.filledBuy(PAMP_ID, 10, '100'),
      LedgerEntryMother.newSell(PAMP_ID, 4, '150'),
    ];

    // Act
    const summary = ledger.summarize(ENTRIES);

    // Assert
    const holding = summary.holdings.get(PAMP_ID);
    expect(holding?.quantity).toBe(10);
    expect(holding?.availableQuantity).toBe(6);
  });

  it('should recompute the moving average on a second BUY', () => {
    // Arrange
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(10000),
      LedgerEntryMother.filledBuy(PAMP_ID, 10, '100'),
      LedgerEntryMother.filledBuy(PAMP_ID, 10, '200'),
    ];
    const EXPECTED_AVERAGE = new Decimal('150');

    // Act
    const summary = ledger.summarize(ENTRIES);

    // Assert
    const holding = summary.holdings.get(PAMP_ID);
    expect(holding?.quantity).toBe(20);
    expect(holding?.averagePrice?.equals(EXPECTED_AVERAGE)).toBe(true);
  });

  it('should set the average to null when a SELL leaves the holding at exactly 0', () => {
    // Arrange
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.filledBuy(PAMP_ID, 10, '100'),
      LedgerEntryMother.filledSell(PAMP_ID, 10, '120'),
    ];

    // Act
    const summary = ledger.summarize(ENTRIES);

    // Assert
    const holding = summary.holdings.get(PAMP_ID);
    expect(holding?.quantity).toBe(0);
    expect(holding?.averagePrice).toBeNull();
  });

  it('should keep a negative quantity and a null average when a SELL goes below 0', () => {
    // Arrange: seed user 1, instrument 31 (BUY 20 + SELL 30)
    const INSTRUMENT_31 = 31;
    const ENTRIES = [
      LedgerEntryMother.filledBuy(INSTRUMENT_31, 20, '1540'),
      LedgerEntryMother.filledSell(INSTRUMENT_31, 30, '1530'),
    ];

    // Act
    const summary = ledger.summarize(ENTRIES);

    // Assert
    const holding = summary.holdings.get(INSTRUMENT_31);
    expect(holding?.quantity).toBe(-10);
    expect(holding?.averagePrice).toBeNull();
  });

  it('should keep a negative quantity and a null average when a SELL has no earlier BUY', () => {
    // Arrange
    const INSTRUMENT_31 = 31;
    const ENTRIES = [LedgerEntryMother.filledSell(INSTRUMENT_31, 3, '10')];
    const EXPECTED_TOTAL_CASH = new Decimal('30');

    // Act
    const summary = ledger.summarize(ENTRIES);

    // Assert
    const holding = summary.holdings.get(INSTRUMENT_31);
    expect(summary.totalCash.equals(EXPECTED_TOTAL_CASH)).toBe(true);
    expect(holding?.quantity).toBe(-3);
    expect(holding?.averagePrice).toBeNull();
  });

  it('should use the price of the BUY as the average when buying back from 0 or below', () => {
    // Arrange: seed holding of -10, then a BUY of 15 @ 1600 takes it to 5
    const INSTRUMENT_31 = 31;
    const ENTRIES = [
      LedgerEntryMother.filledBuy(INSTRUMENT_31, 20, '1540'),
      LedgerEntryMother.filledSell(INSTRUMENT_31, 30, '1530'),
      LedgerEntryMother.filledBuy(INSTRUMENT_31, 15, '1600'),
    ];
    const EXPECTED_AVERAGE = new Decimal('1600');

    // Act
    const summary = ledger.summarize(ENTRIES);

    // Assert
    const holding = summary.holdings.get(INSTRUMENT_31);
    expect(holding?.quantity).toBe(5);
    expect(holding?.averagePrice?.equals(EXPECTED_AVERAGE)).toBe(true);
  });

  it('should not round the average price', () => {
    // Arrange: 1 @ 33.33, 1 @ 33.33, 1 @ 33.34 -> 100 / 3
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledBuy(PAMP_ID, 1, '33.33'),
      LedgerEntryMother.filledBuy(PAMP_ID, 1, '33.33'),
      LedgerEntryMother.filledBuy(PAMP_ID, 1, '33.34'),
    ];
    const EXPECTED_AVERAGE_TEN_DECIMALS = '33.3333333333';

    // Act
    const summary = ledger.summarize(ENTRIES);

    // Assert
    const holding = summary.holdings.get(PAMP_ID);
    expect(holding?.averagePrice?.toFixed(10)).toBe(
      EXPECTED_AVERAGE_TEN_DECIMALS,
    );
  });

  it('should replay entries by datetime regardless of input order', () => {
    // Arrange: chronological BUY 10 @ 100, SELL 10, BUY 10 @ 200 -> average 200; passed in reverse
    const PAMP_ID = 47;
    const FIRST_BUY = LedgerEntryMother.placedAt(
      LedgerEntryMother.filledBuy(PAMP_ID, 10, '100'),
      1,
      '2023-07-12T10:00:00Z',
    );
    const SELL = LedgerEntryMother.placedAt(
      LedgerEntryMother.filledSell(PAMP_ID, 10, '110'),
      2,
      '2023-07-12T11:00:00Z',
    );
    const SECOND_BUY = LedgerEntryMother.placedAt(
      LedgerEntryMother.filledBuy(PAMP_ID, 10, '200'),
      3,
      '2023-07-12T12:00:00Z',
    );
    const REVERSED_ENTRIES = [SECOND_BUY, SELL, FIRST_BUY];
    const EXPECTED_AVERAGE = new Decimal('200');

    // Act
    const summary = ledger.summarize(REVERSED_ENTRIES);

    // Assert
    const holding = summary.holdings.get(PAMP_ID);
    expect(holding?.quantity).toBe(10);
    expect(holding?.averagePrice?.equals(EXPECTED_AVERAGE)).toBe(true);
  });

  it('should break a datetime tie by id ascending', () => {
    // Arrange: same datetime, ids 1 < 2 < 3, passed in reverse
    const PAMP_ID = 47;
    const SAME_INSTANT = '2023-07-12T10:00:00Z';
    const FIRST_BUY = LedgerEntryMother.placedAt(
      LedgerEntryMother.filledBuy(PAMP_ID, 10, '100'),
      1,
      SAME_INSTANT,
    );
    const SELL = LedgerEntryMother.placedAt(
      LedgerEntryMother.filledSell(PAMP_ID, 10, '110'),
      2,
      SAME_INSTANT,
    );
    const SECOND_BUY = LedgerEntryMother.placedAt(
      LedgerEntryMother.filledBuy(PAMP_ID, 10, '200'),
      3,
      SAME_INSTANT,
    );
    const REVERSED_ENTRIES = [SECOND_BUY, SELL, FIRST_BUY];
    const EXPECTED_AVERAGE = new Decimal('200');

    // Act
    const summary = ledger.summarize(REVERSED_ENTRIES);

    // Assert
    expect(
      summary.holdings.get(PAMP_ID)?.averagePrice?.equals(EXPECTED_AVERAGE),
    ).toBe(true);
  });

  it('should ignore NEW CASH_IN and CASH_OUT', () => {
    // Arrange
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.newCashIn(500),
      LedgerEntryMother.newCashOut(200),
    ];
    const EXPECTED_CASH = new Decimal('1000');

    // Act
    const summary = ledger.summarize(ENTRIES);

    // Assert
    expect(summary.totalCash.equals(EXPECTED_CASH)).toBe(true);
    expect(summary.availableCash.equals(EXPECTED_CASH)).toBe(true);
    expect(summary.holdings.size).toBe(0);
  });
});
