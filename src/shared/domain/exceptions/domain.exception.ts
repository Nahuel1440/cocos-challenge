import type { ErrorCategory } from '@/shared/domain/exceptions/error-category';

export abstract class DomainException extends Error {
  public abstract readonly code: string;
  public abstract readonly category: ErrorCategory;
}
