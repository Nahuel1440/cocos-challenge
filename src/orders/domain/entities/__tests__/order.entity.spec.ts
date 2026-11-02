import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { OrderInputMother } from '@/orders/domain/entities/__tests__/order-input.mother';
import { Order } from '@/orders/domain/entities/order.entity';

const INSTRUMENT_ID = 47;
const USER_ID = 7;
const NOW = new Date('2026-01-15T12:00:00.000Z');

describe('place', () => {
  it('should keep the userId, the given datetime and a null id', () => {
    // Arrange
    const OTHER_USER_ID = 8;
    const PLACED_AT = new Date('2026-03-01T10:15:00.000Z');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 5,
    });

    // Act
    const order = Order.place({
      userId: OTHER_USER_ID,
      input,
      marketPrice: new Decimal('100.00'),
      availableCash: new Decimal('1000'),
      availableShares: 0,
      now: PLACED_AT,
    });

    // Assert
    const primitives = order.toPrimitives();
    expect(primitives.id).toBeNull();
    expect(primitives.userId).toBe(OTHER_USER_ID);
    expect(primitives.datetime).toBe(PLACED_AT);
    expect(primitives.instrumentId).toBe(INSTRUMENT_ID);
    expect(primitives.side).toBe('BUY');
    expect(primitives.type).toBe('MARKET');
  });

  it('should expose price as a decimal string in toPrimitives', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('930.55');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    });

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: new Decimal('1000'),
      availableShares: 0,
      now: NOW,
    });

    // Assert
    expect(order.toPrimitives().price).toBe('930.55');
  });

  it('should serialize the price with 2 decimals when it has no decimal part', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    });

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: new Decimal('1000'),
      availableShares: 0,
      now: NOW,
    });

    // Assert
    expect(order.toPrimitives().price).toBe('100.00');
  });

  it('should fill a MARKET BUY at the market price when cash covers it', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 5,
    });
    const AVAILABLE_CASH = new Decimal('1000');
    const AVAILABLE_SHARES = 0;

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('FILLED');
    expect(order.getRejectionReason()).toBeNull();
    expect(order.toPrimitives().price).toBe('100.00');
    expect(order.toPrimitives().size).toBe(5);
  });

  it('should leave a LIMIT BUY as NEW at the limit price when cash covers it', () => {
    // Arrange
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

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: new Decimal('100.00'),
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('NEW');
    expect(order.toPrimitives().price).toBe('90.00');
  });

  it('should ignore the market price when the order is a LIMIT', () => {
    // Arrange
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

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: NO_MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('NEW');
    expect(order.getRejectionReason()).toBeNull();
    expect(order.toPrimitives().price).toBe('90.00');
  });

  it('should accept a BUY when its cost equals the available cash', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 10,
    });
    const AVAILABLE_CASH = new Decimal('1000');
    const AVAILABLE_SHARES = 0;

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('FILLED');
    expect(order.getRejectionReason()).toBeNull();
  });

  it('should leave a LIMIT SELL as NEW when available shares cover the size', () => {
    // Arrange
    const LIMIT_PRICE = new Decimal('120.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'LIMIT',
      size: 4,
      limitPrice: LIMIT_PRICE,
    });
    const AVAILABLE_CASH = new Decimal('0');
    const AVAILABLE_SHARES = 10;

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: new Decimal('100.00'),
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('NEW');
    expect(order.getRejectionReason()).toBeNull();
    expect(order.toPrimitives().price).toBe('120.00');
    expect(order.toPrimitives().size).toBe(4);
  });

  it('should reject with INSUFFICIENT_FUNDS when cost exceeds available cash', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 11,
    });
    const AVAILABLE_CASH = new Decimal('1000');
    const AVAILABLE_SHARES = 0;

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_FUNDS');
    expect(order.toPrimitives().price).toBe('100.00');
    expect(order.toPrimitives().size).toBe(11);
  });

  it('should fill a MARKET SELL when available shares cover the size', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: 4,
    });
    const AVAILABLE_CASH = new Decimal('0');
    const AVAILABLE_SHARES = 10;

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('FILLED');
    expect(order.getRejectionReason()).toBeNull();
    expect(order.toPrimitives().price).toBe('100.00');
    expect(order.toPrimitives().size).toBe(4);
  });

  it('should accept a SELL when its size equals the available shares', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: 10,
    });
    const AVAILABLE_CASH = new Decimal('0');
    const AVAILABLE_SHARES = 10;

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('FILLED');
    expect(order.getRejectionReason()).toBeNull();
  });

  it('should reject with INSUFFICIENT_SHARES when size exceeds the available shares', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: 11,
    });
    const AVAILABLE_CASH = new Decimal('0');
    const AVAILABLE_SHARES = 10;

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_SHARES');
    expect(order.toPrimitives().price).toBe('100.00');
    expect(order.toPrimitives().size).toBe(11);
  });

  it('should reject with INSUFFICIENT_SHARES when available shares are 0', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: 1,
    });
    const AVAILABLE_CASH = new Decimal('0');
    const AVAILABLE_SHARES = 0;

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_SHARES');
  });

  it('should reject with INSUFFICIENT_SHARES when available shares are negative', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: 1,
    });
    const AVAILABLE_CASH = new Decimal('0');
    const AVAILABLE_SHARES = -3;

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_SHARES');
  });

  it('should reject with NO_MARKET_PRICE and a null price when a MARKET order has no market price', () => {
    // Arrange
    const NO_MARKET_PRICE = null;
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 5,
    });
    const AVAILABLE_CASH = new Decimal('1000');
    const AVAILABLE_SHARES = 0;

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: NO_MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('NO_MARKET_PRICE');
    expect(order.toPrimitives().price).toBeNull();
    expect(order.toPrimitives().size).toBe(5);
  });

  it('should reject with NO_MARKET_PRICE and a null size when the order came with an amount', () => {
    // Arrange
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

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: NO_MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('NO_MARKET_PRICE');
    expect(order.toPrimitives().size).toBeNull();
  });

  it('should report NO_MARKET_PRICE before checking funds when both fail', () => {
    // Arrange
    const NO_MARKET_PRICE = null;
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 5,
    });
    const AVAILABLE_CASH = new Decimal('10');
    const AVAILABLE_SHARES = 0;

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: NO_MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getRejectionReason()).toBe('NO_MARKET_PRICE');
  });

  it('should round the size down when the division is not exact (10000.00/930.00 -> 10)', () => {
    // Arrange
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

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('FILLED');
    expect(order.toPrimitives().size).toBe(10);
  });

  it('should give the exact size when the division has no remainder (0.30/0.10 -> 3)', () => {
    // Arrange
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

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.toPrimitives().size).toBe(3);
  });

  it('should reject with AMOUNT_BELOW_ONE_SHARE and size 0 when a MARKET amount buys no share', () => {
    // Arrange
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

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('AMOUNT_BELOW_ONE_SHARE');
    expect(order.toPrimitives().size).toBe(0);
    expect(order.toPrimitives().price).toBe('930.00');
  });

  it('should check cash against the size computed from the amount', () => {
    // Arrange
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

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('FILLED');
    expect(order.toPrimitives().size).toBe(10);
  });

  it('should compute the size from the amount on a SELL too', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('930.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: null,
      amount: new Decimal('10000.00'),
    });
    const AVAILABLE_CASH = new Decimal('0');
    const AVAILABLE_SHARES = 10;

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('FILLED');
    expect(order.toPrimitives().size).toBe(10);
  });

  it('should compare the exact cost against cash without float error', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('0.10');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 3,
    });
    const AVAILABLE_CASH = new Decimal('0.3');
    const AVAILABLE_SHARES = 0;

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('FILLED');
    expect(order.getRejectionReason()).toBeNull();
  });

  it('should compute the size from the amount at the limit price on a LIMIT', () => {
    // Arrange
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

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: MARKET_PRICE,
      availableCash: AVAILABLE_CASH,
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('NEW');
    expect(order.toPrimitives().price).toBe('500.00');
    expect(order.toPrimitives().size).toBe(20);
  });

  it('should reject with INSUFFICIENT_FUNDS and keep the limit price when a LIMIT BUY exceeds available cash', () => {
    // Arrange
    const LIMIT_PRICE = new Decimal('100.00');
    const AVAILABLE_CASH = new Decimal('999.99');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'LIMIT',
      size: 10,
      limitPrice: LIMIT_PRICE,
    });

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: null,
      availableCash: AVAILABLE_CASH,
      availableShares: 0,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_FUNDS');
    expect(order.toPrimitives().price).toBe('100.00');
    expect(order.toPrimitives().size).toBe(10);
  });

  it('should reject with INSUFFICIENT_SHARES when a LIMIT SELL exceeds the available shares', () => {
    // Arrange
    const AVAILABLE_SHARES = 4;
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'LIMIT',
      size: 5,
      limitPrice: new Decimal('100.00'),
    });

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: null,
      availableCash: new Decimal('0'),
      availableShares: AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_SHARES');
  });

  it('should reject with NO_MARKET_PRICE when a MARKET SELL has no market price', () => {
    // Arrange
    const NO_MARKET_PRICE = null;
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: 1,
    });

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: NO_MARKET_PRICE,
      availableCash: new Decimal('0'),
      availableShares: 10,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('NO_MARKET_PRICE');
    expect(order.toPrimitives().price).toBeNull();
  });

  it('should reject with AMOUNT_BELOW_ONE_SHARE when a MARKET SELL amount sells no share', () => {
    // Arrange
    const NEGATIVE_AVAILABLE_SHARES = -10;
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: null,
      amount: new Decimal('50.00'),
    });

    // Act
    const order = Order.place({
      userId: USER_ID,
      input,
      marketPrice: new Decimal('100.00'),
      availableCash: new Decimal('0'),
      availableShares: NEGATIVE_AVAILABLE_SHARES,
      now: NOW,
    });

    // Assert
    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('AMOUNT_BELOW_ONE_SHARE');
    expect(order.toPrimitives().size).toBe(0);
  });

  it.each([
    { marketPrice: '0', size: 5, amount: null, expectedSize: 5 },
    { marketPrice: '-1.00', size: null, amount: '100.00', expectedSize: null },
  ])(
    'should reject with NO_MARKET_PRICE when the market price is 0 or below',
    ({ marketPrice, size, amount, expectedSize }) => {
      // Arrange
      const input = OrderInputMother.create({
        instrumentId: INSTRUMENT_ID,
        side: 'BUY',
        type: 'MARKET',
        size,
        amount: amount === null ? null : new Decimal(amount),
      });

      // Act
      const order = Order.place({
        userId: USER_ID,
        input,
        marketPrice: new Decimal(marketPrice),
        availableCash: new Decimal('1000'),
        availableShares: 0,
        now: NOW,
      });

      // Assert
      expect(order.getStatus()).toBe('REJECTED');
      expect(order.getRejectionReason()).toBe('NO_MARKET_PRICE');
      expect(order.toPrimitives().price).toBeNull();
      expect(order.toPrimitives().size).toBe(expectedSize);
    },
  );
});
