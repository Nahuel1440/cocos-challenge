import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import {
  Order,
  type OrderSide,
  type OrderType,
} from '@/orders/domain/entities/order.entity';
import { IdempotencyKeyConflictException } from '@/orders/domain/exceptions/idempotency-key-conflict.exception';
import { OrderInstrumentNotTradableException } from '@/orders/domain/exceptions/order-instrument-not-tradable.exception';
import {
  IDEMPOTENCY_REPOSITORY,
  type IdempotencyRepository,
} from '@/orders/domain/ports/idempotency.repository';
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
import {
  LEDGER_STATUSES,
  SummarizeLedgerService,
} from '@/orders/domain/services/summarize-ledger.service';
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
  idempotencyKey: string | null;
}

export interface SendOrderResult {
  replayed: boolean;
  status: number;
  orderId: number;
  body: Record<string, unknown>;
}

interface RememberRequestParams {
  input: SendOrderInput;
  result: SendOrderResult;
}

const CREATED_STATUS = 201;
const SEND_ORDER_OPERATION = 'SEND_ORDER';

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
    @Inject(IDEMPOTENCY_REPOSITORY)
    private readonly idempotency: IdempotencyRepository,
    private readonly summarizeLedger: SummarizeLedgerService,
  ) {}

  public async run(input: SendOrderInput): Promise<SendOrderResult> {
    const { userId, instrumentId } = input;

    await this.assertTradable(instrumentId);

    const outcome = await this.uow.run(async () => {
      await this.orders.lockLedger(userId);

      const replay = await this.searchReplay(input);
      if (replay !== null) {
        return { result: replay, placed: null };
      }

      const placed = await this.place(input);
      const result = this.toResult(placed);
      await this.rememberRequest({ input, result });

      return { result, placed };
    });

    if (outcome.placed !== null) {
      this.logOutcome(outcome.placed);
    }

    return outcome.result;
  }

  private async searchReplay(
    input: SendOrderInput,
  ): Promise<SendOrderResult | null> {
    const { userId, idempotencyKey } = input;
    if (idempotencyKey === null) return null;

    const stored = await this.idempotency.searchByKey({
      userId,
      operation: SEND_ORDER_OPERATION,
      key: idempotencyKey,
    });
    if (stored === null) return null;
    if (stored.requestHash !== this.hashRequest(input)) {
      throw new IdempotencyKeyConflictException();
    }

    return {
      replayed: true,
      status: stored.response.status,
      orderId: stored.orderId,
      body: stored.response.body,
    };
  }

  private async place(input: SendOrderInput): Promise<Order> {
    const { userId, instrumentId } = input;
    const entries = await this.orders.searchByUser({
      userId,
      statuses: LEDGER_STATUSES,
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

    return this.orders.save(order);
  }

  private toResult(order: Order): SendOrderResult {
    const body = order.toPrimitives();

    return {
      replayed: false,
      status: CREATED_STATUS,
      orderId: body.id!,
      body: { ...body },
    };
  }

  private async rememberRequest(params: RememberRequestParams): Promise<void> {
    const { input, result } = params;
    if (input.idempotencyKey === null) return;

    await this.idempotency.save({
      userId: input.userId,
      operation: SEND_ORDER_OPERATION,
      key: input.idempotencyKey,
      requestHash: this.hashRequest(input),
      orderId: result.orderId,
      response: { status: result.status, body: result.body },
    });
  }

  private hashRequest(input: SendOrderInput): string {
    const canonical = JSON.stringify({
      instrumentId: input.instrumentId,
      side: input.side,
      type: input.type,
      size: input.size,
      amount: input.amount,
      price: input.price,
    });

    return createHash('sha256').update(canonical).digest('hex');
  }

  private async assertTradable(instrumentId: number): Promise<void> {
    const type = await this.instrumentTypes.searchTypeById(instrumentId);

    if (type === null || type === 'MONEDA') {
      throw new OrderInstrumentNotTradableException(instrumentId);
    }
  }

  private logOutcome(order: Order): void {
    this.logger.log({
      msg: 'Order placed',
      ...order.toPrimitives(),
    });
  }
}
