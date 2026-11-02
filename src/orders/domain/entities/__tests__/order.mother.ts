import {
  Order,
  type OrderPrimitives,
  type OrderStatus,
} from '@/orders/domain/entities/order.entity';

export class OrderMother {
  public static create(overrides?: Partial<OrderPrimitives>): Order {
    return Order.fromPrimitives({
      id: 1,
      userId: 7,
      instrumentId: 47,
      side: 'BUY',
      type: 'LIMIT',
      size: 5,
      price: '100.00',
      status: 'NEW',
      rejectionReason: null,
      datetime: new Date('2026-01-15T12:00:00.000Z'),
      cancelledAt: null,
      ...overrides,
    });
  }

  public static withStatus(status: OrderStatus): Order {
    return OrderMother.create({
      status,
      rejectionReason: status === 'REJECTED' ? 'INSUFFICIENT_FUNDS' : null,
    });
  }
}
