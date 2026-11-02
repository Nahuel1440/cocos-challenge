import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { LedgerEntryMother } from '@/orders/domain/services/__tests__/ledger-entry.mother';
import { SummarizeLedgerService } from '@/orders/domain/services/summarize-ledger.service';
import type { PortfolioView } from '@/portfolio/application/use-cases/get-portfolio.use-case';
import { BuildPortfolioService } from '@/portfolio/domain/services/build-portfolio.service';
import { PortfolioPresenter } from '@/portfolio/infrastructure/http/portfolio.presenter';

describe('present', () => {
  it('should round the return once on output using the unrounded average', () => {
    const PAMP_ID = 47;
    const PRICE = new Decimal('34.00');
    const entries = ['33.33', '33.33', '33.34'].map((price) =>
      LedgerEntryMother.filledBuy({ instrumentId: PAMP_ID, size: 1, price }),
    );
    const portfolio = new BuildPortfolioService().run({
      summary: new SummarizeLedgerService().run(entries),
      latestPrices: new Map([[PAMP_ID, PRICE]]),
    });
    const position = portfolio.positions[0]!;

    const body = PortfolioPresenter.present({
      totalValue: portfolio.totalValue,
      availableCash: new Decimal('0'),
      positions: [{ ...position, ticker: 'PAMP', name: 'Pampa Holding S.A.' }],
    });

    expect(body.positions[0]!.averagePrice).toBe('33.33');
    expect(body.positions[0]!.totalReturnPercentage).toBe('2.00');
  });

  it('should print null when market value and return are null', () => {
    const NEGATIVE_HOLDING: PortfolioView = {
      totalValue: new Decimal('1000'),
      availableCash: new Decimal('1000'),
      positions: [
        {
          instrumentId: 31,
          ticker: 'BMA',
          name: 'Banco Macro S.A.',
          quantity: -10,
          averagePrice: null,
          marketValue: null,
          totalReturnPercentage: null,
        },
      ],
    };

    const body = PortfolioPresenter.present(NEGATIVE_HOLDING);

    expect(body.positions[0]).toEqual({
      instrumentId: 31,
      ticker: 'BMA',
      name: 'Banco Macro S.A.',
      quantity: -10,
      averagePrice: null,
      marketValue: null,
      totalReturnPercentage: null,
    });
  });
});
