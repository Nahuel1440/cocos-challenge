import { DomainException, ErrorCategory } from '@/shared/domain';

export class OrderSizeTooLargeException extends DomainException {
  public readonly code = 'VALIDATION_ERROR';
  public readonly category = ErrorCategory.InvalidArgument;

  constructor(maxSize: number) {
    super(`The amount buys more than ${maxSize} shares`);
  }
}
