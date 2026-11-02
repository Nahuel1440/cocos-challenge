import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import type { MarketDataRepository } from '@/orders/domain/ports/market-data.repository';
import type { PrismaTransactionHost } from '@/shared/infrastructure/transactions/prisma-transaction-host';

@Injectable()
export class PrismaMarketDataRepository implements MarketDataRepository {
  constructor(
    @Inject(TransactionHost) private readonly txHost: PrismaTransactionHost,
  ) {}

  public async searchLatestClose(
    instrumentId: number,
  ): Promise<Decimal | null> {
    const latest = await this.txHost.tx.marketData.findFirst({
      where: { instrumentId },
      orderBy: { date: 'desc' },
      select: { close: true },
    });

    return latest === null ? null : new Decimal(latest.close.toString());
  }
}
