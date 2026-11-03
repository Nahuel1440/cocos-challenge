import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import type { Prisma } from '@/generated/prisma/client';
import type {
  InstrumentQuote,
  InstrumentQuoteRepository,
} from '@/portfolio/domain/ports/instrument-quote.repository';
import type { PrismaTransactionHost } from '@/shared/infrastructure/transactions/prisma-transaction-host';

type InstrumentWithLatestBar = Prisma.InstrumentGetPayload<{
  include: { marketData: true };
}>;

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

    return rows.map((row) => this.toInstrumentQuote(row));
  }

  private toInstrumentQuote(row: InstrumentWithLatestBar): InstrumentQuote {
    const [latestBar] = row.marketData;

    return {
      instrumentId: row.id,
      ticker: row.ticker,
      name: row.name,
      latestClose: latestBar ? new Decimal(latestBar.close.toString()) : null,
    };
  }
}
