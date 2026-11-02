import Decimal from 'decimal.js';
import type { Prisma } from '@/generated/prisma/client';
import type { InstrumentQuote } from '@/portfolio/domain/ports/instrument-quote.repository';

export type InstrumentWithLatestBar = Prisma.InstrumentGetPayload<{
  include: { marketData: true };
}>;

export class InstrumentQuotePersistenceMapper {
  public static toInstrumentQuote(
    row: InstrumentWithLatestBar,
  ): InstrumentQuote {
    const [latestBar] = row.marketData;

    return {
      instrumentId: row.id,
      ticker: row.ticker,
      name: row.name,
      latestClose: latestBar ? new Decimal(latestBar.close.toString()) : null,
    };
  }
}
