import { Inject, Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import {
  MAX_ORDER_SIZE,
  Order,
  type OrderSide,
  type OrderType,
} from '@/orders/domain/entities/order.entity';
import { OrderSizeTooLargeException } from '@/orders/domain/exceptions/order-size-too-large.exception';
import { OrderInstrumentNotTradableException } from '@/orders/domain/exceptions/order-instrument-not-tradable.exception';
import {
  INSTRUMENT_TYPE_REPOSITORY,
  type InstrumentTypeRepository,
} from '@/orders/domain/ports/instrument-type.repository';
import {
  MARKET_DATA_REPOSITORY,
  type MarketDataRepository,
} from '@/orders/domain/ports/market-data.repository';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@/orders/domain/ports/order.repository';
import { SummarizeLedgerService } from '@/orders/domain/services/summarize-ledger.service';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@/shared/application/unit-of-work.port';

export interface SendOrderInput {
  userId: number;
  instrumentId: number;
  side: Extract<OrderSide, 'BUY' | 'SELL'>;
  type: OrderType;
  size: number | null;
  amount: string | null;
  price: string | null;
}

@Injectable()
export class SendOrderUseCase {
  private readonly logger = new Logger(SendOrderUseCase.name);

  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(MARKET_DATA_REPOSITORY)
    private readonly marketData: MarketDataRepository,
    @Inject(INSTRUMENT_TYPE_REPOSITORY)
    private readonly instrumentTypes: InstrumentTypeRepository,
    private readonly summarizeLedger: SummarizeLedgerService,
  ) {}

  public async run(input: SendOrderInput): Promise<Order> {
    const { userId, instrumentId } = input;

    await this.assertTradable(instrumentId);

    const order = await this.uow.run(async () => {
      await this.orders.lockLedger(userId);

      const entries = await this.orders.searchByUser({
        userId,
        statuses: ['FILLED', 'NEW'],
      });
      const marketPrice = await this.marketData.searchLatestClose(instrumentId);
      const summary = this.summarizeLedger.run(entries);
      const order = Order.place({
        userId,
        input: {
          instrumentId,
          side: input.side,
          type: input.type,
          size: input.size,
          amount: input.amount === null ? null : new Decimal(input.amount),
          limitPrice: input.price === null ? null : new Decimal(input.price),
        },
        marketPrice,
        availableCash: summary.availableCash,
        availableShares:
          summary.holdings.get(instrumentId)?.availableQuantity ?? 0,
        now: new Date(),
      });

      this.assertSizeFits(order);

      return this.orders.save(order);
    });

    this.logOutcome(order);

    return order;
  }

  private async assertTradable(instrumentId: number): Promise<void> {
    const type = await this.instrumentTypes.searchTypeById(instrumentId);

    if (type === null || type === 'MONEDA') {
      throw new OrderInstrumentNotTradableException(instrumentId);
    }
  }

  private assertSizeFits(order: Order): void {
    const { size } = order.toPrimitives();

    if (size !== null && size > MAX_ORDER_SIZE) {
      throw new OrderSizeTooLargeException(MAX_ORDER_SIZE);
    }
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
      msg: 'Order placed',
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
