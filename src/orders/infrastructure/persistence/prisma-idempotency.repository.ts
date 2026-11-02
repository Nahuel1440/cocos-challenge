import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import type {
  IdempotencyRecord,
  IdempotencyRepository,
  SaveIdempotencyParams,
  SearchByKeyParams,
} from '@/orders/domain/ports/idempotency.repository';
import { IdempotencyPersistenceMapper } from '@/orders/infrastructure/persistence/idempotency-persistence.mapper';
import type { PrismaTransactionHost } from '@/shared/infrastructure/transactions/prisma-transaction-host';

@Injectable()
export class PrismaIdempotencyRepository implements IdempotencyRepository {
  constructor(
    @Inject(TransactionHost) private readonly txHost: PrismaTransactionHost,
  ) {}

  public async searchByKey(
    params: SearchByKeyParams,
  ): Promise<IdempotencyRecord | null> {
    const { userId, operation, key } = params;
    const record = await this.txHost.tx.idempotencyRequest.findUnique({
      where: {
        userId_operation_idempotencyKey: {
          userId,
          operation,
          idempotencyKey: key,
        },
      },
    });

    return record === null
      ? null
      : IdempotencyPersistenceMapper.toDomain(record);
  }

  public async save(params: SaveIdempotencyParams): Promise<void> {
    await this.txHost.tx.idempotencyRequest.create({
      data: IdempotencyPersistenceMapper.toPersistence(params),
    });
  }
}
