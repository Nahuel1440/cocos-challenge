export const INSTRUMENT_TYPE_REPOSITORY = Symbol('InstrumentTypeRepository');

export type InstrumentType = 'ACCIONES' | 'MONEDA';

export interface InstrumentTypeRepository {
  searchTypeById(instrumentId: number): Promise<InstrumentType | null>;
}
