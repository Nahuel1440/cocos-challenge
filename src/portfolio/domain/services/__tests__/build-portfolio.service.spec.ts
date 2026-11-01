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
    // Arrange
    const NO_ENTRIES: LedgerEntry[] = [];
    const NO_PRICES = new Map<number, Decimal>();

    // Act
    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(NO_ENTRIES),
      latestPrices: NO_PRICES,
    });

    // Assert
    expect(portfolio.totalValue).toBe('0.00');
    expect(portfolio.positions).toEqual([]);
  });

  it('should compute market value as quantity times the latest price', () => {
    // Arrange
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 3,
        price: '100',
      }),
    ];
    const PRICES = new Map([[PAMP_ID, new Decimal('110.50')]]);

    // Act
    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    // Assert
    expect(portfolio.positions[0]?.marketValue).toBe('331.50');
  });

  it('should return total return in percent when the price is above the average', () => {
    // Arrange
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 1,
        price: '100',
      }),
    ];
    const PRICES = new Map([[PAMP_ID, new Decimal('110')]]);

    // Act
    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    // Assert
    expect(portfolio.positions[0]?.totalReturnPercentage).toBe('10.00');
  });

  it('should return a negative total return when the price is below the average', () => {
    // Arrange
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 1,
        price: '100',
      }),
    ];
    const PRICES = new Map([[PAMP_ID, new Decimal('90')]]);

    // Act
    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    // Assert
    expect(portfolio.positions[0]?.totalReturnPercentage).toBe('-10.00');
  });

  it('should round the return once on output using the unrounded average', () => {
    // Arrange
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

    // Act
    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    // Assert
    expect(portfolio.positions[0]?.totalReturnPercentage).toBe('2.00');
  });

  it('should round half up to two decimals on output', () => {
    // Arrange
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 1,
        price: '100',
      }),
    ];
    const PRICES = new Map([[PAMP_ID, new Decimal('100.125')]]);

    // Act
    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    // Assert
    expect(portfolio.positions[0]?.marketValue).toBe('100.13');
    expect(portfolio.positions[0]?.totalReturnPercentage).toBe('0.13');
  });

  it('should add total cash and the market value of priced positions into total value', () => {
    // Arrange
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

    // Act
    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    // Assert
    expect(portfolio.totalValue).toBe('1100.00');
  });

  it('should use total cash and not available cash for total value', () => {
    // Arrange
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.newBuy({
        instrumentId: PAMP_ID,
        size: 4,
        price: '100',
      }),
    ];

    // Act
    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: new Map<number, Decimal>(),
    });

    // Assert
    expect(portfolio.totalValue).toBe('1000.00');
  });

  it('should show null market value and return and leave the position out of total value when it has no price', () => {
    // Arrange
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.filledBuy({
        instrumentId: PAMP_ID,
        size: 2,
        price: '100',
      }),
    ];

    // Act
    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: new Map<number, Decimal>(),
    });

    // Assert
    expect(portfolio.positions[0]?.marketValue).toBeNull();
    expect(portfolio.positions[0]?.totalReturnPercentage).toBeNull();
    expect(portfolio.totalValue).toBe('800.00');
  });

  it('should show a negative market value and null return for a negative holding', () => {
    // Arrange
    const PAMP_ID = 47;
    const ENTRIES = [
      LedgerEntryMother.filledSell({
        instrumentId: PAMP_ID,
        size: 10,
        price: '100',
      }),
    ];
    const PRICES = new Map([[PAMP_ID, new Decimal('120')]]);

    // Act
    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    // Assert
    expect(portfolio.positions[0]?.quantity).toBe(-10);
    expect(portfolio.positions[0]?.averagePrice).toBeNull();
    expect(portfolio.positions[0]?.marketValue).toBe('-1200.00');
    expect(portfolio.positions[0]?.totalReturnPercentage).toBeNull();
  });

  it('should not list a position whose quantity is zero', () => {
    // Arrange
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

    // Act
    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    // Assert
    expect(portfolio.positions).toEqual([]);
  });

  it('should expose instrument id, quantity and rounded average price per position', () => {
    // Arrange
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

    // Act
    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    // Assert
    expect(portfolio.positions).toEqual([
      {
        instrumentId: PAMP_ID,
        quantity: 3,
        averagePrice: '33.33',
        marketValue: '102.00',
        totalReturnPercentage: '2.00',
      },
    ]);
  });

  it('should total mixed priced, unpriced and negative positions correctly', () => {
    // Arrange
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
    const EXPECTED_TOTAL_VALUE = '1020.00';

    // Act
    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: PRICES,
    });

    // Assert
    expect(portfolio.totalValue).toBe(EXPECTED_TOTAL_VALUE);
  });

  it('should list positions ordered by instrument id', () => {
    // Arrange
    const ENTRIES = [
      LedgerEntryMother.filledBuy({ instrumentId: 54, size: 1, price: '10' }),
      LedgerEntryMother.filledBuy({ instrumentId: 31, size: 1, price: '10' }),
      LedgerEntryMother.filledBuy({ instrumentId: 47, size: 1, price: '10' }),
    ];

    // Act
    const portfolio = buildPortfolio.run({
      summary: summarizeLedger.run(ENTRIES),
      latestPrices: new Map<number, Decimal>(),
    });

    // Assert
    expect(portfolio.positions.map((p) => p.instrumentId)).toEqual([
      31, 47, 54,
    ]);
  });
});
