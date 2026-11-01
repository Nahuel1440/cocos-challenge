import { DomainException } from '@/shared/domain/exceptions/domain.exception';
import { ErrorCategory } from '@/shared/domain/exceptions/error-category';

export class UnknownUserException extends DomainException {
  public readonly code = 'UNKNOWN_USER';
  public readonly category = ErrorCategory.InvalidArgument;

  constructor(userId: string) {
    super(`User ${userId} does not exist`);
  }
}
