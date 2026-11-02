import type Decimal from 'decimal.js';

export const MARKET_DATA_REPOSITORY = Symbol('MarketDataRepository');

export interface MarketDataRepository {
  searchLatestClose(instrumentId: number): Promise<Decimal | null>;
}
