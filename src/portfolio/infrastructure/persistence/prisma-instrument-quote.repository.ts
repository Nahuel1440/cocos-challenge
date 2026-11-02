import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import type {
  InstrumentQuote,
  InstrumentQuoteRepository,
} from '@/portfolio/domain/ports/instrument-quote.repository';
import type { PrismaTransactionHost } from '@/shared/infrastructure/transactions/prisma-transaction-host';

@Injectable()
export class PrismaInstrumentQuoteRepository implements InstrumentQuoteRepository {
  constructor(
    @Inject(TransactionHost) private readonly txHost: PrismaTransactionHost,
  ) {}

  public async searchByInstrumentIds(
    instrumentIds: number[],
  ): Promise<InstrumentQuote[]> {
    const rows = await this.txHost.tx.instrument.findMany({
      where: { id: { in: instrumentIds } },
      include: { marketData: { orderBy: { date: 'desc' }, take: 1 } },
    });

    return rows.map((row) => ({
      instrumentId: row.id,
      ticker: row.ticker,
      name: row.name,
      latestClose: row.marketData[0]
        ? new Decimal(row.marketData[0].close.toString())
        : null,
    }));
  }
}
