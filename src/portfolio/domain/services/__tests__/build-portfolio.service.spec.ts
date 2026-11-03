import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { LedgerEntryMother } from '@/orders/domain/services/__tests__/ledger-entry.mother';
import {
  SummarizeLedgerService,
  type LedgerEntry,
} from '@/orders/domain/services/summarize-ledger.service';
import { BuildPortfolioService } from '@/portfolio/domain/services/build-portfolio.service';

const summarizeLedger = new SummarizeLedgerService();
const buildPortfolio = new BuildPortfolioService();

describe('run', () => {
  it('should return zero totals and no positions when the ledger is empty', () => {
    const NO_ENTRIES: LedgerEntry[] = [];
    const NO_PRICES = new Map<number, Decimal>();

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(NO_ENTRIES),
      latestPrices: NO_PRICES,
    });

    expect(portfolio.totalValue.equals(0)).toBe(true);
    expect(portfolio.positions).toEqual([]);
  });

  it('should compute market value as quantity times the latest price', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 3,
        price: '100',
      }),
    ];
    const PRICES = new Map([[PAMP_ID, new Decimal('110.50')]]);

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    expect(portfolio.positions[0]?.marketValue?.equals('331.5')).toBe(true);
  });

  it('should return total return in percent when the price is above the average', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 1,
        price: '100',
      }),
    ];
    const PRICES = new Map([[PAMP_ID, new Decimal('110')]]);

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    expect(portfolio.positions[0]?.totalReturnPercentage?.equals(10)).toBe(
      true,
    );
  });

  it('should return a negative total return when the price is below the average', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 1,
        price: '100',
      }),
    ];
    const PRICES = new Map([[PAMP_ID, new Decimal('90')]]);

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    expect(portfolio.positions[0]?.totalReturnPercentage?.equals(-10)).toBe(
      true,
    );
  });

  it('should add total cash and the market value of priced positions into total value', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 2,
        price: '100',
      }),
    ];
    const PRICES = new Map([[PAMP_ID, new Decimal('150')]]);

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    expect(portfolio.totalValue.equals(1100)).toBe(true);
  });

  it('should use total cash and not available cash for total value', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.newBuy({
        instrumentId: PAMP_ID,
        size: 4,
        price: '100',
      }),
    ];

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: new Map<number, Decimal>(),
    });

    expect(portfolio.totalValue.equals(1000)).toBe(true);
  });

  it('should show null market value and return and leave the position out of total value when it has no price', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 2,
        price: '100',
      }),
    ];

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: new Map<number, Decimal>(),
    });

    expect(portfolio.positions[0]?.marketValue).toBeNull();
    expect(portfolio.positions[0]?.totalReturnPercentage).toBeNull();
    expect(portfolio.totalValue.equals(800)).toBe(true);
  });

  it('should show a negative market value and null return for a negative holding', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledSell({
        instrumentId: PAMP_ID,
        size: 10,
        price: '100',
      }),
    ];
    const PRICES = new Map([[PAMP_ID, new Decimal('120')]]);

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    expect(portfolio.positions[0]?.quantity).toBe(-10);
    expect(portfolio.positions[0]?.averagePrice).toBeNull();
    expect(portfolio.positions[0]?.marketValue?.equals(-1200)).toBe(true);
    expect(portfolio.positions[0]?.totalReturnPercentage).toBeNull();
  });

  it('should not list a position whose quantity is zero', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 5,
        price: '100',
      }),
      LedgerEntryMother.filledSell({
        instrumentId: PAMP_ID,
        size: 5,
        price: '110',
      }),
    ];
    const PRICES = new Map([[PAMP_ID, new Decimal('120')]]);

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    expect(portfolio.positions).toEqual([]);
  });

  it('should expose instrument id, quantity and full-precision values per position', () => {
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
    const PRICES = new Map([[PAMP_ID, new Decimal('34.00')]]);

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    const [position] = portfolio.positions;
    expect(portfolio.positions).toHaveLength(1);
    expect(position?.instrumentId).toBe(PAMP_ID);
    expect(position?.quantity).toBe(3);
    expect(position?.averagePrice?.toString()).toMatch(/^33\.3333333/);
    expect(position?.marketValue?.equals(102)).toBe(true);
    expect(position?.totalReturnPercentage?.minus(2).abs().lt('1e-15')).toBe(
      true,
    );
  });

  it('should total mixed priced, unpriced and negative positions correctly', () => {
    const PAMP_ID = 47;
    const UNPRICED_ID = 31;
    const SHORT_ID = 54;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 2,
        price: '100',
      }),
      LedgerEntryMother.filledBuy({
        instrumentId: UNPRICED_ID,
        size: 5,
        price: '10',
      }),
      LedgerEntryMother.filledSell({
        instrumentId: SHORT_ID,
        size: 3,
        price: '50',
      }),
    ];
    const PRICES = new Map([
      [PAMP_ID, new Decimal('150')],
      [SHORT_ID, new Decimal('60')],
    ]);
    // cash 1000 - 200 - 50 + 150 = 900; market 300 - 180 = 120; unpriced excluded
    const EXPECTED_TOTAL_VALUE = 1020;

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    expect(portfolio.totalValue.equals(EXPECTED_TOTAL_VALUE)).toBe(true);
  });

  it('should list positions ordered by instrument id', () => {
    const ENTRIES = [
      LedgerEntryMother.filledBuy({ instrumentId: 54, size: 1, price: '10' }),
      LedgerEntryMother.filledBuy({ instrumentId: 31, size: 1, price: '10' }),
      LedgerEntryMother.filledBuy({ instrumentId: 47, size: 1, price: '10' }),
    ];

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: new Map<number, Decimal>(),
    });

    expect(portfolio.positions.map((p) => p.instrumentId)).toEqual([
      31, 47, 54,
    ]);
  });

  it('should keep the average price at full precision', () => {
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
    const PRICES = new Map([[PAMP_ID, new Decimal('34.00')]]);

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    const averagePrice = portfolio.positions[0]?.averagePrice;
    expect(averagePrice?.decimalPlaces()).toBeGreaterThan(2);
    expect(averagePrice?.toString()).toMatch(/^33\.3333333/);
  });

  it('should compute the return from the unrounded average', () => {
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
    const PRICES = new Map([[PAMP_ID, new Decimal('34.00')]]);
    const TOLERANCE = '1e-15';

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    // a rounded 33.33 average would give 2.0102...
    const totalReturn = portfolio.positions[0]?.totalReturnPercentage;
    expect(totalReturn?.minus(2).abs().lt(TOLERANCE)).toBe(true);
  });

  it('should keep a return that is almost zero unrounded', () => {
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 1,
        price: '100.00',
      }),
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 1,
        price: '100.01',
      }),
    ];
    const PRICES = new Map([[PAMP_ID, new Decimal('100.00')]]);

    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    const totalReturn = portfolio.positions[0]?.totalReturnPercentage;
    expect(totalReturn?.isNegative()).toBe(true);
    expect(totalReturn?.isZero()).toBe(false);
  });
});
