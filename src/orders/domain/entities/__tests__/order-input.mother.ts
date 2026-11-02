import type { OrderInput } from '@/orders/domain/entities/order.entity';

export class OrderInputMother {
  public static create(overrides?: Partial<OrderInput>): OrderInput {
    return {
      instrumentId: 47,
      side: 'BUY',
      type: 'MARKET',
      size: 1,
      amount: null,
      limitPrice: null,
      ...overrides,
    };
  }
}
