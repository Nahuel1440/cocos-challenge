import { DomainException } from '@/shared/domain/exceptions/domain.exception';
import { ErrorCategory } from '@/shared/domain/exceptions/error-category';

export class InvalidUserIdException extends DomainException {
  public readonly code = 'INVALID_USER_ID';
  public readonly category = ErrorCategory.InvalidArgument;

  constructor() {
    super('X-User-Id must be an integer without leading zeros');
  }
}
