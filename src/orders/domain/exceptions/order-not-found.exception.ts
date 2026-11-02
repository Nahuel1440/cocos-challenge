import { DomainException, ErrorCategory } from '@/shared/domain';

export class OrderNotFoundException extends DomainException {
  public readonly code = 'ORDER_NOT_FOUND';
  public readonly category = ErrorCategory.NotFound;

  constructor(orderId: number) {
    super(`Order ${orderId} does not exist`);
  }
}
