import { DomainException } from '@/shared/domain/exceptions/domain.exception';
import { ErrorCategory } from '@/shared/domain/exceptions/error-category';

export class MissingUserIdException extends DomainException {
  public readonly code = 'MISSING_USER_ID';
  public readonly category = ErrorCategory.InvalidArgument;

  constructor() {
    super('X-User-Id header is required');
  }
}
