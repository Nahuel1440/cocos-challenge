import { DomainException, ErrorCategory } from '@/shared/domain';

export class OrderNotCancellableException extends DomainException {
  public readonly code = 'ORDER_NOT_CANCELLABLE';
  public readonly category = ErrorCategory.Conflict;

  constructor(status: string) {
    super(`A ${status} order cannot be cancelled`);
  }
}
