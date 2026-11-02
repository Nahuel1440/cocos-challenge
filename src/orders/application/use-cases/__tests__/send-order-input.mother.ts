import type { SendOrderInput } from '@/orders/application/use-cases/send-order.use-case';

export class SendOrderInputMother {
  public static create(overrides?: Partial<SendOrderInput>): SendOrderInput {
    return {
      userId: 1,
      instrumentId: 47,
      side: 'BUY',
      type: 'MARKET',
      size: 1,
      amount: null,
      price: null,
      idempotencyKey: null,
      ...overrides,
    };
  }
}
