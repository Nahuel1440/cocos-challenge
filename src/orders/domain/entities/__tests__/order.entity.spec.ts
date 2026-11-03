import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { OrderInputMother } from '@/orders/domain/entities/__tests__/order-input.mother';
import { OrderMother } from '@/orders/domain/entities/__tests__/order.mother';
import { Order } from '@/orders/domain/entities/order.entity';
import { OrderNotCancellableException } from '@/orders/domain/exceptions/order-not-cancellable.exception';
import { OrderSizeTooLargeException } from '@/orders/domain/exceptions/order-size-too-large.exception';

const INSTRUMENT_ID = 47;
const USER_ID = 7;
const NOW = new Date('2026-01-15T12:00:00.000Z');

describe('place', () => {
  it('should keep the userId, the given datetime and a null id', () => {
    const OTHER_USER_ID = 8;
    const PLACED_AT = new Date('2026-03-01T10:15:00.000Z');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 5,
    });

    const order = Order.place({
      userId: OTHER_USER_ID,
      input,
      marketPrice: new Decimal('100.00'),
      availableCash: new Decimal('1000'),
      availableShares: 0,
      now: PLACED_AT,
    });

    const primitives = order.toPrimitives();
    expect(primitives.id).toBeNull();
    expect(primitives.userId).toBe(OTHER_USER_ID);
    expect(primitives.datetime).toBe(PLACED_AT);
    expect(primitives.instrumentId).toBe(INSTRUMENT_ID);
    expect(primitives.side).toBe('BUY');
    expect(primitives.type).toBe('MARKET');
  });

  it('should serialize the price with 2 decimals when it has no decimal part', () => {
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    });

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: new Decimal('1000'),
      availableShares: 0,
      now: NOW,
    });

    expect(order.toPrimitives().price).toBe('100.00');
  });

  it('should fill a MARKET BUY at the market price when cash covers it', () => {
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 5,
    });
    const AVAILABLE_CASH = new Decimal('1000');
    const AVAILABLE_SHARES = 0;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('FILLED');
    expect(order.getRejectionReason()).toBeNull();
    expect(order.toPrimitives().price).toBe('100.00');
    expect(order.toPrimitives().size).toBe(5);
  });

  it('should leave a LIMIT BUY as NEW at the limit price when cash covers it', () => {
    const LIMIT_PRICE = new Decimal('90.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'LIMIT',
      size: 5,
      limitPrice: LIMIT_PRICE,
    });
    const AVAILABLE_CASH = new Decimal('1000');
    const AVAILABLE_SHARES = 0;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: new Decimal('100.00'),
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('NEW');
    expect(order.toPrimitives().price).toBe('90.00');
  });

  it('should ignore the market price when the order is a LIMIT', () => {
    const LIMIT_PRICE = new Decimal('90.00');
    const NO_MARKET_PRICE = null;
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'LIMIT',
      size: 5,
      limitPrice: LIMIT_PRICE,
    });
    const AVAILABLE_CASH = new Decimal('1000');
    const AVAILABLE_SHARES = 0;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: NO_MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('NEW');
    expect(order.getRejectionReason()).toBeNull();
    expect(order.toPrimitives().price).toBe('90.00');
  });

  it('should accept a BUY when its cost equals the available cash', () => {
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 10,
    });
    const AVAILABLE_CASH = new Decimal('1000');
    const AVAILABLE_SHARES = 0;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('FILLED');
    expect(order.getRejectionReason()).toBeNull();
  });

  it('should reject with INSUFFICIENT_FUNDS when cost exceeds available cash', () => {
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 11,
    });
    const AVAILABLE_CASH = new Decimal('1000');
    const AVAILABLE_SHARES = 0;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_FUNDS');
    expect(order.toPrimitives().price).toBe('100.00');
    expect(order.toPrimitives().size).toBe(11);
  });

  it('should fill a MARKET SELL when available shares cover the size', () => {
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: 4,
    });
    const AVAILABLE_CASH = new Decimal('0');
    const AVAILABLE_SHARES = 10;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('FILLED');
    expect(order.getRejectionReason()).toBeNull();
    expect(order.toPrimitives().price).toBe('100.00');
    expect(order.toPrimitives().size).toBe(4);
  });

  it('should accept a SELL when its size equals the available shares', () => {
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: 10,
    });
    const AVAILABLE_CASH = new Decimal('0');
    const AVAILABLE_SHARES = 10;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('FILLED');
    expect(order.getRejectionReason()).toBeNull();
  });

  it('should reject with INSUFFICIENT_SHARES when size exceeds the available shares', () => {
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: 11,
    });
    const AVAILABLE_CASH = new Decimal('0');
    const AVAILABLE_SHARES = 10;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_SHARES');
    expect(order.toPrimitives().price).toBe('100.00');
    expect(order.toPrimitives().size).toBe(11);
  });

  it('should reject with INSUFFICIENT_SHARES when available shares are negative', () => {
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: 1,
    });
    const AVAILABLE_CASH = new Decimal('0');
    const AVAILABLE_SHARES = -3;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_SHARES');
  });

  it('should reject with NO_MARKET_PRICE and a null price when a MARKET order has no market price', () => {
    const NO_MARKET_PRICE = null;
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 5,
    });
    const AVAILABLE_CASH = new Decimal('1000');
    const AVAILABLE_SHARES = 0;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: NO_MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('NO_MARKET_PRICE');
    expect(order.toPrimitives().price).toBeNull();
    expect(order.toPrimitives().size).toBe(5);
  });

  it('should reject with NO_MARKET_PRICE and a null size when the order came with an amount', () => {
    const NO_MARKET_PRICE = null;
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: null,
      amount: new Decimal('500.00'),
    });
    const AVAILABLE_CASH = new Decimal('1000');
    const AVAILABLE_SHARES = 0;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: NO_MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('NO_MARKET_PRICE');
    expect(order.toPrimitives().size).toBeNull();
  });

  it('should round the size down when the division is not exact (10000.00/930.00 -> 10)', () => {
    const MARKET_PRICE = new Decimal('930.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: null,
      amount: new Decimal('10000.00'),
    });
    const AVAILABLE_CASH = new Decimal('100000');
    const AVAILABLE_SHARES = 0;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('FILLED');
    expect(order.toPrimitives().size).toBe(10);
  });

  it('should give the exact size when the division has no remainder (0.30/0.10 -> 3)', () => {
    const MARKET_PRICE = new Decimal('0.10');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: null,
      amount: new Decimal('0.30'),
    });
    const AVAILABLE_CASH = new Decimal('1000');
    const AVAILABLE_SHARES = 0;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.toPrimitives().size).toBe(3);
  });

  it('should reject with AMOUNT_BELOW_ONE_SHARE and size 0 when a MARKET amount buys no share', () => {
    const MARKET_PRICE = new Decimal('930.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: null,
      amount: new Decimal('929.99'),
    });
    const AVAILABLE_CASH = new Decimal('100000');
    const AVAILABLE_SHARES = 0;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('AMOUNT_BELOW_ONE_SHARE');
    expect(order.toPrimitives().size).toBe(0);
    expect(order.toPrimitives().price).toBe('930.00');
  });

  it('should check cash against the size computed from the amount', () => {
    const MARKET_PRICE = new Decimal('930.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: null,
      amount: new Decimal('10000.00'),
    });
    const AVAILABLE_CASH = new Decimal('9500');
    const AVAILABLE_SHARES = 0;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('FILLED');
    expect(order.toPrimitives().size).toBe(10);
  });

  it('should compare the exact cost against cash without float error', () => {
    const MARKET_PRICE = new Decimal('0.10');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 3,
    });
    const AVAILABLE_CASH = new Decimal('0.3');
    const AVAILABLE_SHARES = 0;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('FILLED');
    expect(order.getRejectionReason()).toBeNull();
  });

  it('should compute the size from the amount at the limit price on a LIMIT', () => {
    const LIMIT_PRICE = new Decimal('500.00');
    const MARKET_PRICE = new Decimal('930.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'LIMIT',
      size: null,
      amount: new Decimal('10000.00'),
      limitPrice: LIMIT_PRICE,
    });
    const AVAILABLE_CASH = new Decimal('100000');
    const AVAILABLE_SHARES = 0;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('NEW');
    expect(order.toPrimitives().price).toBe('500.00');
    expect(order.toPrimitives().size).toBe(20);
  });

  it('should reject with INSUFFICIENT_FUNDS and keep the limit price when a LIMIT BUY exceeds available cash', () => {
    const LIMIT_PRICE = new Decimal('100.00');
    const AVAILABLE_CASH = new Decimal('999.99');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'LIMIT',
      size: 10,
      limitPrice: LIMIT_PRICE,
    });

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: null,
      availableCash: AVAILABLE_CASH,
      availableShares: 0,
      now: NOW,
    });

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_FUNDS');
    expect(order.toPrimitives().price).toBe('100.00');
    expect(order.toPrimitives().size).toBe(10);
  });

  it('should reject with INSUFFICIENT_SHARES when a LIMIT SELL exceeds the available shares', () => {
    const AVAILABLE_SHARES = 4;
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'LIMIT',
      size: 5,
      limitPrice: new Decimal('100.00'),
    });

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: null,
      availableCash: new Decimal('0'),
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_SHARES');
  });

  it('should reject with NO_MARKET_PRICE when a MARKET SELL has no market price', () => {
    const NO_MARKET_PRICE = null;
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: 1,
    });

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: NO_MARKET_PRICE,
      availableCash: new Decimal('0'),
      availableShares: 10,
      now: NOW,
    });

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('NO_MARKET_PRICE');
    expect(order.toPrimitives().price).toBeNull();
  });

  it('should reject with AMOUNT_BELOW_ONE_SHARE when a MARKET SELL amount sells no share', () => {
    const NEGATIVE_AVAILABLE_SHARES = -10;
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: null,
      amount: new Decimal('50.00'),
    });

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: new Decimal('100.00'),
      availableCash: new Decimal('0'),
      availableShares: NEGATIVE_AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('AMOUNT_BELOW_ONE_SHARE');
    expect(order.toPrimitives().size).toBe(0);
  });

  it('should reject with INSUFFICIENT_FUNDS when the size computed from the amount costs more than the available cash', () => {
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: null,
      amount: new Decimal('10000.00'),
    });
    const AVAILABLE_CASH = new Decimal('9299.99');

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: new Decimal('930.00'),
      availableCash: AVAILABLE_CASH,
      availableShares: 0,
      now: NOW,
    });

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_FUNDS');
    expect(order.toPrimitives().size).toBe(10);
  });

  it('should reject with INSUFFICIENT_SHARES when the size computed from the amount is above the available shares', () => {
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: null,
      amount: new Decimal('10000.00'),
    });
    const AVAILABLE_SHARES = 9;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: new Decimal('930.00'),
      availableCash: new Decimal('0'),
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_SHARES');
    expect(order.toPrimitives().size).toBe(10);
  });

  it('should reject with AMOUNT_BELOW_ONE_SHARE before checking funds when a MARKET BUY amount buys no share', () => {
    const NEGATIVE_AVAILABLE_CASH = new Decimal('-1');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: null,
      amount: new Decimal('50.00'),
    });

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: new Decimal('100.00'),
      availableCash: NEGATIVE_AVAILABLE_CASH,
      availableShares: 0,
      now: NOW,
    });

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('AMOUNT_BELOW_ONE_SHARE');
  });

  it('should place a NEW LIMIT SELL with the size computed from the amount', () => {
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'LIMIT',
      size: null,
      amount: new Decimal('10000.00'),
      limitPrice: new Decimal('500.00'),
    });
    const AVAILABLE_SHARES = 20;

    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: new Decimal('930.00'),
      availableCash: new Decimal('0'),
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    expect(order.getStatus()).toBe('NEW');
    expect(order.getRejectionReason()).toBeNull();
    expect(order.toPrimitives().price).toBe('500.00');
    expect(order.toPrimitives().size).toBe(20);
  });

  it.each([
    { marketPrice: '0', size: 5, amount: null, expectedSize: 5 },
    { marketPrice: '-1.00', size: null, amount: '100.00', expectedSize: null },
  ])(
    'should reject with NO_MARKET_PRICE when the market price is $marketPrice, size $size and amount $amount',
    ({ marketPrice, size, amount, expectedSize }) => {
      const input = OrderInputMother.create({
        instrumentId: INSTRUMENT_ID,
        side: 'BUY',
        type: 'MARKET',
        size,
        amount: amount === null ? null : new Decimal(amount),
      });

      const order = Order.place({
        userId: USER_ID,
        input,
        marketPrice: new Decimal(marketPrice),
        availableCash: new Decimal('1000'),
        availableShares: 0,
        now: NOW,
      });

      expect(order.getStatus()).toBe('REJECTED');
      expect(order.getRejectionReason()).toBe('NO_MARKET_PRICE');
      expect(order.toPrimitives().price).toBeNull();
      expect(order.toPrimitives().size).toBe(expectedSize);
    },
  );

  it('should throw when the size exceeds the maximum even if the order would be rejected', () => {
    const HUGE_AMOUNT = new Decimal('99999999.99');
    const TINY_PRICE = new Decimal('0.01');
    const NO_CASH = new Decimal('0');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: null,
      amount: HUGE_AMOUNT,
    });

    const place = () =>
      Order.place({
        userId: USER_ID,
        input,
        marketPrice: TINY_PRICE,
        availableCash: NO_CASH,
        availableShares: 0,
        now: NOW,
      });

    expect(place).toThrow(OrderSizeTooLargeException);
  });
});

describe('cancel', () => {
  it('should set CANCELLED and the cancelled date when a NEW order is cancelled', () => {
    const CANCELLED_AT = new Date('2026-02-01T09:30:00.000Z');
    const order = OrderMother.withStatus('NEW');

    order.cancel(CANCELLED_AT);

    const primitives = order.toPrimitives();
    expect(primitives.status).toBe('CANCELLED');
    expect(primitives.cancelledAt).toBe(CANCELLED_AT);
  });

  it('should leave an already CANCELLED order unchanged', () => {
    const FIRST_CANCEL = new Date('2026-02-01T09:30:00.000Z');
    const RETRY = new Date('2026-02-01T09:31:00.000Z');
    const order = OrderMother.create({
      status: 'CANCELLED',
      cancelledAt: FIRST_CANCEL,
    });

    order.cancel(RETRY);

    const primitives = order.toPrimitives();
    expect(primitives.status).toBe('CANCELLED');
    expect(primitives.cancelledAt).toBe(FIRST_CANCEL);
  });

  it('should reject the cancel when the order is FILLED', () => {
    const order = OrderMother.withStatus('FILLED');

    expect(() => order.cancel(NOW)).toThrow(OrderNotCancellableException);
  });

  it('should reject the cancel when the order is REJECTED', () => {
    const order = OrderMother.withStatus('REJECTED');

    expect(() => order.cancel(NOW)).toThrow(OrderNotCancellableException);
  });
});
