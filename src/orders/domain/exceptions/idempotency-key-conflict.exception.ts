import { DomainException, ErrorCategory } from '@/shared/domain';

export class IdempotencyKeyConflictException extends DomainException {
  public readonly code = 'IDEMPOTENCY_KEY_CONFLICT';
  public readonly category = ErrorCategory.Unprocessable;

  constructor() {
    super('The Idempotency-Key was already used with a different request');
  }
}
