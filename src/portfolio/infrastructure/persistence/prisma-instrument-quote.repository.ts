import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import type {
  InstrumentQuote,
  InstrumentQuoteRepository,
} from '@/portfolio/domain/ports/instrument-quote.repository';
import { InstrumentQuotePersistenceMapper } from '@/portfolio/infrastructure/persistence/instrument-quote-persistence.mapper';
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

    return rows.map((row) =>
      InstrumentQuotePersistenceMapper.toInstrumentQuote(row),
    );
  }
}
