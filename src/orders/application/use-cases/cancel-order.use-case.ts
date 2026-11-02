import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Order } from '@/orders/domain/entities/order.entity';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@/orders/domain/ports/order.repository';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@/shared/application/unit-of-work.port';

export interface CancelOrderInput {
  userId: number;
  orderId: number;
}

@Injectable()
export class CancelOrderUseCase {
  private readonly logger = new Logger(CancelOrderUseCase.name);

  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
  ) {}

  public async run(input: CancelOrderInput): Promise<Order> {
    const { userId, orderId } = input;

    const cancelled = await this.uow.run(async () => {
      await this.orders.lockLedger(userId);

      const order = await this.orders.findByIdForUser({ orderId, userId });
      order.cancel(new Date());

      return this.orders.save(order);
    });

    this.logOutcome(cancelled);

    return cancelled;
  }

  private logOutcome(order: Order): void {
    const {
      id,
      userId,
      instrumentId,
      side,
      type,
      status,
      rejectionReason,
      size,
      price,
    } = order.toPrimitives();

    this.logger.log({
      msg: 'Order cancelled',
      orderId: id,
      userId,
      instrumentId,
      side,
      type,
      status,
      rejectionReason,
      size,
      price,
    });
  }
}
