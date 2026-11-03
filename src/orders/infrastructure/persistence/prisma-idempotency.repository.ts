import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import type { IdempotencyRequest } from '@/generated/prisma/client';
import type {
  IdempotencyRecord,
  IdempotencyRepository,
  SaveIdempotencyParams,
  SearchByKeyParams,
} from '@/orders/domain/ports/idempotency.repository';
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

    return record === null ? null : this.toDomain(record);
  }

  public async save(params: SaveIdempotencyParams): Promise<void> {
    await this.txHost.tx.idempotencyRequest.create({
      data: {
        userId: params.userId,
        operation: params.operation,
        idempotencyKey: params.key,
        requestHash: params.requestHash,
        orderId: params.orderId,
        responseStatus: params.response.status,
        responseBody: JSON.parse(JSON.stringify(params.response.body)),
      },
    });
  }

  private toDomain(record: IdempotencyRequest): IdempotencyRecord {
    return {
      requestHash: record.requestHash,
      orderId: record.orderId,
      response: {
        status: record.responseStatus,
        body: record.responseBody as Record<string, unknown>,
      },
    };
  }
}
