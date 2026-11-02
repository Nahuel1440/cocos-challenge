export const INSTRUMENT_REPOSITORY = Symbol('InstrumentRepository');

export interface InstrumentSummary {
  id: number;
  ticker: string;
  name: string;
  type: string;
}

export interface SearchByTextParams {
  text: string;
}

export interface InstrumentRepository {
  searchByText(params: SearchByTextParams): Promise<InstrumentSummary[]>;
}
