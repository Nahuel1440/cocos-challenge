import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { DecideOrderService } from '@/orders/domain/services/decide-order.service';
import { LedgerEntryMother } from '@/orders/domain/services/__tests__/ledger-entry.mother';
import { OrderInputMother } from '@/orders/domain/services/__tests__/order-input.mother';
import { SummarizeLedgerService } from '@/orders/domain/services/summarize-ledger.service';

const decideOrder = new DecideOrderService();
const summarizeLedger = new SummarizeLedgerService();
const INSTRUMENT_ID = 47;

describe('run', () => {
  it('should fill a MARKET BUY at the market price when cash covers it', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 5,
    });
    const summary = summarizeLedger.run([LedgerEntryMother.filledCashIn(1000)]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('FILLED');
    expect(decision.rejectionReason).toBeNull();
    expect(decision.price?.equals(MARKET_PRICE)).toBe(true);
    expect(decision.size).toBe(5);
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
    const summary = summarizeLedger.run([LedgerEntryMother.filledCashIn(1000)]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: new Decimal('100.00'),
    });

    // Assert
    expect(decision.status).toBe('NEW');
    expect(decision.price?.equals(LIMIT_PRICE)).toBe(true);
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
    const summary = summarizeLedger.run([LedgerEntryMother.filledCashIn(1000)]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: NO_MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('NEW');
    expect(decision.rejectionReason).toBeNull();
    expect(decision.price?.equals(LIMIT_PRICE)).toBe(true);
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
    const summary = summarizeLedger.run([LedgerEntryMother.filledCashIn(1000)]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('FILLED');
    expect(decision.rejectionReason).toBeNull();
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
    const summary = summarizeLedger.run([LedgerEntryMother.filledCashIn(1000)]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('REJECTED');
    expect(decision.rejectionReason).toBe('INSUFFICIENT_FUNDS');
    expect(decision.price?.equals(MARKET_PRICE)).toBe(true);
    expect(decision.size).toBe(11);
  });

  it('should reject with INSUFFICIENT_FUNDS when a NEW LIMIT BUY already reserves the cash', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 5,
    });
    const summary = summarizeLedger.run([
      LedgerEntryMother.filledCashIn(1000),
      LedgerEntryMother.newBuy({
        instrumentId: INSTRUMENT_ID,
        size: 8,
        price: '100.00',
      }),
    ]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('REJECTED');
    expect(decision.rejectionReason).toBe('INSUFFICIENT_FUNDS');
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
    const summary = summarizeLedger.run([
      LedgerEntryMother.filledBuy({
        instrumentId: INSTRUMENT_ID,
        size: 10,
        price: '50.00',
      }),
    ]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('FILLED');
    expect(decision.rejectionReason).toBeNull();
    expect(decision.price?.equals(MARKET_PRICE)).toBe(true);
    expect(decision.size).toBe(4);
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
    const summary = summarizeLedger.run([
      LedgerEntryMother.filledBuy({
        instrumentId: INSTRUMENT_ID,
        size: 10,
        price: '50.00',
      }),
    ]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('FILLED');
    expect(decision.rejectionReason).toBeNull();
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
    const summary = summarizeLedger.run([
      LedgerEntryMother.filledBuy({
        instrumentId: INSTRUMENT_ID,
        size: 10,
        price: '50.00',
      }),
    ]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('REJECTED');
    expect(decision.rejectionReason).toBe('INSUFFICIENT_SHARES');
    expect(decision.price?.equals(MARKET_PRICE)).toBe(true);
    expect(decision.size).toBe(11);
  });

  it('should reject with INSUFFICIENT_SHARES when a NEW LIMIT SELL already reserves the shares', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: 4,
    });
    const summary = summarizeLedger.run([
      LedgerEntryMother.filledBuy({
        instrumentId: INSTRUMENT_ID,
        size: 10,
        price: '50.00',
      }),
      LedgerEntryMother.newSell({
        instrumentId: INSTRUMENT_ID,
        size: 8,
        price: '120.00',
      }),
    ]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('REJECTED');
    expect(decision.rejectionReason).toBe('INSUFFICIENT_SHARES');
  });

  it('should reject with INSUFFICIENT_SHARES when the user holds none of the instrument', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: 1,
    });
    const summary = summarizeLedger.run([LedgerEntryMother.filledCashIn(1000)]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('REJECTED');
    expect(decision.rejectionReason).toBe('INSUFFICIENT_SHARES');
  });

  it('should reject with INSUFFICIENT_SHARES when the holding is negative', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'SELL',
      type: 'MARKET',
      size: 1,
    });
    const summary = summarizeLedger.run([
      LedgerEntryMother.filledSell({
        instrumentId: INSTRUMENT_ID,
        size: 3,
        price: '50.00',
      }),
    ]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('REJECTED');
    expect(decision.rejectionReason).toBe('INSUFFICIENT_SHARES');
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
    const summary = summarizeLedger.run([LedgerEntryMother.filledCashIn(1000)]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: NO_MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('REJECTED');
    expect(decision.rejectionReason).toBe('NO_MARKET_PRICE');
    expect(decision.price).toBeNull();
    expect(decision.size).toBe(5);
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
    const summary = summarizeLedger.run([LedgerEntryMother.filledCashIn(1000)]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: NO_MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('REJECTED');
    expect(decision.rejectionReason).toBe('NO_MARKET_PRICE');
    expect(decision.size).toBeNull();
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
    const summary = summarizeLedger.run([
      LedgerEntryMother.filledCashIn(100000),
    ]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('FILLED');
    expect(decision.size).toBe(10);
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
    const summary = summarizeLedger.run([LedgerEntryMother.filledCashIn(1000)]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.size).toBe(3);
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
    const summary = summarizeLedger.run([
      LedgerEntryMother.filledCashIn(100000),
    ]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('REJECTED');
    expect(decision.rejectionReason).toBe('AMOUNT_BELOW_ONE_SHARE');
    expect(decision.size).toBe(0);
    expect(decision.price?.equals(MARKET_PRICE)).toBe(true);
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
    const summary = summarizeLedger.run([LedgerEntryMother.filledCashIn(9500)]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('FILLED');
    expect(decision.size).toBe(10);
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
    const summary = summarizeLedger.run([
      LedgerEntryMother.filledBuy({
        instrumentId: INSTRUMENT_ID,
        size: 10,
        price: '50.00',
      }),
    ]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('FILLED');
    expect(decision.size).toBe(10);
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
    const summary = summarizeLedger.run([LedgerEntryMother.filledCashIn(0.3)]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('FILLED');
    expect(decision.rejectionReason).toBeNull();
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
    const summary = summarizeLedger.run([LedgerEntryMother.filledCashIn(10)]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: NO_MARKET_PRICE,
    });

    // Assert
    expect(decision.rejectionReason).toBe('NO_MARKET_PRICE');
  });

  it('should not use a NEW CASH_IN as available cash', () => {
    // Arrange
    const MARKET_PRICE = new Decimal('100.00');
    const input = OrderInputMother.create({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      size: 5,
    });
    const summary = summarizeLedger.run([LedgerEntryMother.newCashIn(1000)]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('REJECTED');
    expect(decision.rejectionReason).toBe('INSUFFICIENT_FUNDS');
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
    const summary = summarizeLedger.run([
      LedgerEntryMother.filledCashIn(100000),
    ]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: MARKET_PRICE,
    });

    // Assert
    expect(decision.status).toBe('NEW');
    expect(decision.price?.equals(LIMIT_PRICE)).toBe(true);
    expect(decision.size).toBe(20);
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
    const summary = summarizeLedger.run([
      LedgerEntryMother.filledBuy({
        instrumentId: INSTRUMENT_ID,
        size: 10,
        price: '50.00',
      }),
    ]);

    // Act
    const decision = decideOrder.run({
      input,
      summary,
      marketPrice: new Decimal('100.00'),
    });

    // Assert
    expect(decision.status).toBe('NEW');
    expect(decision.rejectionReason).toBeNull();
    expect(decision.price?.equals(LIMIT_PRICE)).toBe(true);
    expect(decision.size).toBe(4);
  });
});
