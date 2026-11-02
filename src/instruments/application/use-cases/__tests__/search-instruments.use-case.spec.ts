import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { SearchInstrumentsUseCase } from '@/instruments/application/use-cases/search-instruments.use-case';
import type { InstrumentRepository } from '@/instruments/domain/ports/instrument.repository';

const mockInstruments: Mocked<InstrumentRepository> = {
  searchByText: vi.fn(),
};
const useCase = new SearchInstrumentsUseCase(mockInstruments);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('run', () => {
  it('should return an empty list without querying the database when the query is empty or only spaces', async () => {
    const BLANK_QUERIES = ['', '   ', '\t\n'];

    for (const query of BLANK_QUERIES) {
      const result = await useCase.run({ query });

      expect(result).toEqual([]);
    }
    expect(mockInstruments.searchByText).not.toHaveBeenCalled();
  });
});
