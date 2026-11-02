import Decimal from 'decimal.js';

export const MAX_ORDER_SIZE = 2147483647;

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type OrderStatus = 'NEW' | 'FILLED' | 'CANCELLED' | 'REJECTED';
export type RejectionReason =
  | 'INSUFFICIENT_FUNDS'
  | 'INSUFFICIENT_SHARES'
  | 'AMOUNT_BELOW_ONE_SHARE'
  | 'NO_MARKET_PRICE';

export interface OrderInput {
  instrumentId: number;
  side: OrderSide;
  type: OrderType;
  size: number | null;
  amount: Decimal | null;
  limitPrice: Decimal | null;
}

export interface PlaceOrderParams {
  userId: number;
  input: OrderInput;
  marketPrice: Decimal | null;
  availableCash: Decimal;
  availableShares: number;
  now: Date;
}

export interface OrderPrimitives {
  id: number | null; // null until the database assigns it on save
  userId: number;
  instrumentId: number;
  side: OrderSide;
  type: OrderType;
  size: number | null;
  price: string | null;
  status: OrderStatus;
  rejectionReason: RejectionReason | null;
  datetime: Date;
}

interface OrderProps {
  id: number | null;
  userId: number;
  instrumentId: number;
  side: OrderSide;
  type: OrderType;
  size: number | null;
  price: Decimal | null;
  status: OrderStatus;
  rejectionReason: RejectionReason | null;
  datetime: Date;
}

interface DeriveStatusParams {
  input: OrderInput;
  rejection: RejectionReason | null;
}

interface DeriveRejectionReasonParams {
  input: OrderInput;
  price: Decimal | null;
  size: number | null;
  availableCash: Decimal;
  availableShares: number;
}

interface DeriveSizeParams {
  input: OrderInput;
  price: Decimal | null;
}

interface IsAmountBelowOneShareParams {
  input: OrderInput;
  size: number;
}

export class Order {
  private readonly id: number | null;
  private readonly userId: number;
  private readonly instrumentId: number;
  private readonly side: OrderSide;
  private readonly type: OrderType;
  private readonly size: number | null;
  private readonly price: Decimal | null;
  private readonly status: OrderStatus;
  private readonly rejectionReason: RejectionReason | null;
  private readonly datetime: Date;

  private constructor(props: OrderProps) {
    const {
      id,
      userId,
      instrumentId,
      side,
      type,
      size,
      price,
      status,
      rejectionReason,
      datetime,
    } = props;

    this.id = id;
    this.userId = userId;
    this.instrumentId = instrumentId;
    this.side = side;
    this.type = type;
    this.size = size;
    this.price = price;
    this.status = status;
    this.rejectionReason = rejectionReason;
    this.datetime = datetime;
  }

  public static place(params: PlaceOrderParams): Order {
    const { userId, input, marketPrice, availableCash, availableShares, now } =
      params;
    const price =
      input.type === 'LIMIT'
        ? input.limitPrice
        : Order.positivePriceOrNull(marketPrice);
    const size = Order.deriveSize({ input, price });
    const rejection = Order.deriveRejectionReason({
      input,
      price,
      size,
      availableCash,
      availableShares,
    });

    return new Order({
      id: null,
      userId,
      instrumentId: input.instrumentId,
      side: input.side,
      type: input.type,
      size,
      price,
      status: Order.deriveStatus({ input, rejection }),
      rejectionReason: rejection,
      datetime: now,
    });
  }

  public static fromPrimitives(primitives: OrderPrimitives): Order {
    return new Order({
      ...primitives,
      price: primitives.price === null ? null : new Decimal(primitives.price),
    });
  }

  private static deriveStatus(params: DeriveStatusParams): OrderStatus {
    const { input, rejection } = params;

    if (rejection !== null) return 'REJECTED';

    return input.type === 'LIMIT' ? 'NEW' : 'FILLED';
  }

  private static deriveRejectionReason(
    params: DeriveRejectionReasonParams,
  ): RejectionReason | null {
    const { input, price, size, availableCash, availableShares } = params;

    // size is null only when price is null: the order came with an amount
    if (price === null || size === null) return 'NO_MARKET_PRICE';
    if (Order.isAmountBelowOneShare({ input, size }))
      return 'AMOUNT_BELOW_ONE_SHARE';
    if (input.side === 'BUY' && price.times(size).greaterThan(availableCash)) {
      return 'INSUFFICIENT_FUNDS';
    }
    if (input.side === 'SELL' && size > availableShares) {
      return 'INSUFFICIENT_SHARES';
    }

    return null;
  }

  private static positivePriceOrNull(
    marketPrice: Decimal | null,
  ): Decimal | null {
    if (marketPrice === null || marketPrice.lessThanOrEqualTo(0)) return null;

    return marketPrice;
  }

  private static deriveSize(params: DeriveSizeParams): number | null {
    const { input, price } = params;

    if (input.size !== null) return input.size;
    if (price === null) return null;

    return (input.amount ?? new Decimal(0)).divToInt(price).toNumber();
  }

  private static isAmountBelowOneShare(
    params: IsAmountBelowOneShareParams,
  ): boolean {
    const { input, size } = params;
    const cameWithAmount = input.amount !== null;

    return input.type === 'MARKET' && cameWithAmount && size === 0;
  }

  public toPrimitives(): OrderPrimitives {
    return {
      id: this.id,
      userId: this.userId,
      instrumentId: this.instrumentId,
      side: this.side,
      type: this.type,
      size: this.size,
      price:
        this.price === null
          ? null
          : this.price.toFixed(2, Decimal.ROUND_HALF_UP),
      status: this.status,
      rejectionReason: this.rejectionReason,
      datetime: this.datetime,
    };
  }

  public getStatus(): OrderStatus {
    return this.status;
  }

  public getRejectionReason(): RejectionReason | null {
    return this.rejectionReason;
  }
}
