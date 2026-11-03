import { Injectable } from '@nestjs/common';
import type {
  InstrumentRepository,
  InstrumentSummary,
  SearchTradableByTextParams,
} from '@/instruments/domain/ports/instrument.repository';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaInstrumentRepository implements InstrumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async searchTradableByText(
    params: SearchTradableByTextParams,
  ): Promise<InstrumentSummary[]> {
    const { text } = params;
    const escaped = text.replace(/[\\%_]/g, '\\$&');
    const prefix = `${escaped}%`;
    const contains = `%${escaped}%`;

    return this.prisma.$queryRaw<InstrumentSummary[]>`
      SELECT id, ticker, name, type::text AS type
      FROM instruments
      WHERE type <> 'MONEDA'
        AND (ticker ILIKE ${contains} OR name ILIKE ${contains})
      ORDER BY
        CASE
          WHEN ticker ILIKE ${escaped} THEN 1
          WHEN ticker ILIKE ${prefix} THEN 2
          WHEN name ILIKE ${prefix} THEN 3
          ELSE 4
        END,
        ticker ASC,
        id ASC`;
  }
}
