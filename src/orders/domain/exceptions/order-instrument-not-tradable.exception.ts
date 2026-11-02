import { DomainException, ErrorCategory } from '@/shared/domain';

export class OrderInstrumentNotTradableException extends DomainException {
  public readonly code = 'VALIDATION_ERROR';
  public readonly category = ErrorCategory.InvalidArgument;

  constructor(instrumentId: number) {
    super(`Instrument ${instrumentId} does not exist or cannot be traded`);
  }
}
