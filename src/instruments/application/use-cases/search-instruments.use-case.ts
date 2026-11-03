import { Inject, Injectable } from '@nestjs/common';
import {
  INSTRUMENT_REPOSITORY,
  type InstrumentRepository,
  type InstrumentSummary,
} from '@/instruments/domain/ports/instrument.repository';

const MAX_RESULTS = 50;

export interface SearchInstrumentsInput {
  query: string;
}

@Injectable()
export class SearchInstrumentsUseCase {
  constructor(
    @Inject(INSTRUMENT_REPOSITORY)
    private readonly instruments: InstrumentRepository,
  ) {}

  public async run(
    input: SearchInstrumentsInput,
  ): Promise<InstrumentSummary[]> {
    const { query } = input;

    const text = query.trim();
    if (text === '') {
      return [];
    }

    return this.instruments.searchTradableByText({
      text,
      limit: MAX_RESULTS,
    });
  }
}
