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
});
