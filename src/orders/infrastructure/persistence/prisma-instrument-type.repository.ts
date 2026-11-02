import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import type {
  InstrumentType,
  InstrumentTypeRepository,
} from '@/orders/domain/ports/instrument-type.repository';
import type { PrismaTransactionHost } from '@/shared/infrastructure/transactions/prisma-transaction-host';

@Injectable()
export class PrismaInstrumentTypeRepository implements InstrumentTypeRepository {
  constructor(
    @Inject(TransactionHost) private readonly txHost: PrismaTransactionHost,
  ) {}

  public async searchTypeById(
    instrumentId: number,
  ): Promise<InstrumentType | null> {
    const instrument = await this.txHost.tx.instrument.findUnique({
      where: { id: instrumentId },
      select: { type: true },
    });

    return instrument?.type ?? null;
  }
}
