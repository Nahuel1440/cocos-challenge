import { Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { SendOrderInputMother } from '@/orders/application/use-cases/__tests__/send-order-input.mother';
import { SendOrderUseCase } from '@/orders/application/use-cases/send-order.use-case';
import { OrderSizeTooLargeException } from '@/orders/domain/exceptions/order-size-too-large.exception';
import type { InstrumentTypeRepository } from '@/orders/domain/ports/instrument-type.repository';
import type { MarketDataRepository } from '@/orders/domain/ports/market-data.repository';
import type { OrderRepository } from '@/orders/domain/ports/order.repository';
import { LedgerEntryMother } from '@/orders/domain/services/__tests__/ledger-entry.mother';
import { SummarizeLedgerService } from '@/orders/domain/services/summarize-ledger.service';
import type { UnitOfWork } from '@/shared/application/unit-of-work.port';

const INSTRUMENT_ID = 47;

const passThroughUow: UnitOfWork = { run: (work) => work() };
const mockOrders: Mocked<OrderRepository> = {
  lockLedger: vi.fn(),
  searchByUser: vi.fn(),
  findByIdForUser: vi.fn(),
  save: vi.fn(),
};
const mockMarketData: Mocked<MarketDataRepository> = {
  searchLatestClose: vi.fn(),
};
const mockInstrumentTypes: Mocked<InstrumentTypeRepository> = {
  searchTypeById: vi.fn(),
};
const useCase = new SendOrderUseCase(
  passThroughUow,
  mockOrders,
  mockMarketData,
  mockInstrumentTypes,
  new SummarizeLedgerService(),
);

beforeEach(() => {
  Logger.overrideLogger(false);
  vi.resetAllMocks();
  mockInstrumentTypes.searchTypeById.mockResolvedValue('ACCIONES');
  mockOrders.save.mockImplementation(async (order) => order);
});

describe('run', () => {
  it('should reject with INSUFFICIENT_FUNDS when a NEW LIMIT BUY already reserves the cash', async () => {
    const CASH = 1000;
    const RESERVED_SIZE = 5;
    const RESERVED_PRICE = '150';
    const MARKET_PRICE = '200';
    mockOrders.searchByUser.mockResolvedValue([
      LedgerEntryMother.filledCashIn(CASH),
      LedgerEntryMother.newBuy({
        instrumentId: INSTRUMENT_ID,
        size: RESERVED_SIZE,
        price: RESERVED_PRICE,
      }),
    ]);
    mockMarketData.searchLatestClose.mockResolvedValue(
      new Decimal(MARKET_PRICE),
    );

    const order = await useCase.run(
      SendOrderInputMother.create({
        instrumentId: INSTRUMENT_ID,
        side: 'BUY',
        type: 'MARKET',
        size: 2,
      }),
    );

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_FUNDS');
  });

  it('should reject with INSUFFICIENT_SHARES when a NEW LIMIT SELL already reserves the shares', async () => {
    const HELD_SIZE = 10;
    const RESERVED_SIZE = 8;
    mockOrders.searchByUser.mockResolvedValue([
      LedgerEntryMother.filledBuy({
        instrumentId: INSTRUMENT_ID,
        size: HELD_SIZE,
        price: '100',
      }),
      LedgerEntryMother.newSell({
        instrumentId: INSTRUMENT_ID,
        size: RESERVED_SIZE,
        price: '120',
      }),
    ]);
    mockMarketData.searchLatestClose.mockResolvedValue(new Decimal('110'));

    const order = await useCase.run(
      SendOrderInputMother.create({
        instrumentId: INSTRUMENT_ID,
        side: 'SELL',
        type: 'MARKET',
        size: 5,
      }),
    );

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_SHARES');
  });

  it('should not use a NEW CASH_IN as available cash', async () => {
    const PENDING_CASH = 1000;
    mockOrders.searchByUser.mockResolvedValue([
      LedgerEntryMother.newCashIn(PENDING_CASH),
    ]);
    mockMarketData.searchLatestClose.mockResolvedValue(new Decimal('10'));

    const order = await useCase.run(
      SendOrderInputMother.create({
        instrumentId: INSTRUMENT_ID,
        side: 'BUY',
        type: 'MARKET',
        size: 1,
      }),
    );

    expect(order.getStatus()).toBe('REJECTED');
    expect(order.getRejectionReason()).toBe('INSUFFICIENT_FUNDS');
  });

  it('should throw a validation error when a MARKET amount gives a size above the INT maximum', async () => {
    const HUGE_AMOUNT = '99999999.99';
    const TINY_PRICE = '0.01';
    mockOrders.searchByUser.mockResolvedValue([]);
    mockMarketData.searchLatestClose.mockResolvedValue(new Decimal(TINY_PRICE));

    const result = useCase.run(
      SendOrderInputMother.create({
        instrumentId: INSTRUMENT_ID,
        side: 'BUY',
        type: 'MARKET',
        size: null,
        amount: HUGE_AMOUNT,
      }),
    );

    await expect(result).rejects.toThrow(OrderSizeTooLargeException);
    expect(mockOrders.save).not.toHaveBeenCalled();
  });
});
