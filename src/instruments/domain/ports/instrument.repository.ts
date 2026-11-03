export const INSTRUMENT_REPOSITORY = Symbol('InstrumentRepository');

export interface InstrumentSummary {
  id: number;
  ticker: string;
  name: string;
  type: string;
}

export interface SearchTradableByTextParams {
  text: string;
  limit: number;
}

export interface InstrumentRepository {
  // Excludes currencies. Ranks exact ticker, ticker prefix, name prefix, then substring.
  searchTradableByText(
    params: SearchTradableByTextParams,
  ): Promise<InstrumentSummary[]>;
}
