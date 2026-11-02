import Decimal from 'decimal.js';

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

// Serialization shape. Money is a decimal string; Decimal stays inside the entity.
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

export class Order {
  private readonly id: number | null;
  private readonly userId: number;
  private readonly instrumentId: number;
  private readonly side: OrderSide;
  private readonly type: OrderType;
  private readonly size: number | null;
  private readonly price: Decimal | null;
  private status: OrderStatus;
  private rejectionReason: RejectionReason | null;
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
    const { userId, input, marketPrice, now } = params;
    const price = input.type === 'LIMIT' ? input.limitPrice : marketPrice;

    return new Order({
      id: null,
      userId,
      instrumentId: input.instrumentId,
      side: input.side,
      type: input.type,
      size: input.size,
      price,
      status: input.type === 'LIMIT' ? 'NEW' : 'FILLED',
      rejectionReason: null,
      datetime: now,
    });
  }

  public toPrimitives(): OrderPrimitives {
    return {
      id: this.id,
      userId: this.userId,
      instrumentId: this.instrumentId,
      side: this.side,
      type: this.type,
      size: this.size,
      price: this.price === null ? null : this.price.toFixed(),
      status: this.status,
      rejectionReason: this.rejectionReason,
      datetime: this.datetime,
    };
  }

  public getId(): number | null {
    return this.id;
  }

  public getUserId(): number {
    return this.userId;
  }

  public getStatus(): OrderStatus {
    return this.status;
  }

  public getRejectionReason(): RejectionReason | null {
    return this.rejectionReason;
  }
}
