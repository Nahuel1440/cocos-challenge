import type Decimal from 'decimal.js';

export const INSTRUMENT_QUOTE_REPOSITORY = Symbol('InstrumentQuoteRepository');

export interface InstrumentQuote {
  instrumentId: number;
  ticker: string;
  name: string;
  latestClose: Decimal | null;
}

export interface InstrumentQuoteRepository {
  searchByInstrumentIds(instrumentIds: number[]): Promise<InstrumentQuote[]>;
}
