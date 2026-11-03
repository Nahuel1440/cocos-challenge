import { DomainException, ErrorCategory } from '@/shared/domain';

export class LedgerBusyException extends DomainException {
  public readonly code = 'LEDGER_BUSY';
  public readonly category = ErrorCategory.Unavailable;

  constructor() {
    super('Another request for this user is still running. Retry shortly');
  }
}
