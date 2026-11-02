import type { IdempotencyRequest as IdempotencyRecordRow } from '@/generated/prisma/client';
import type { Prisma } from '@/generated/prisma/client';
import type {
  IdempotencyRecord,
  SaveIdempotencyParams,
} from '@/orders/domain/ports/idempotency.repository';

export class IdempotencyPersistenceMapper {
  public static toDomain(record: IdempotencyRecordRow): IdempotencyRecord {
    return {
      requestHash: record.requestHash,
      orderId: record.orderId,
      response: {
        status: record.responseStatus,
        body: record.responseBody as Record<string, unknown>,
      },
    };
  }

  public static toPersistence(
    params: SaveIdempotencyParams,
  ): Prisma.IdempotencyRequestUncheckedCreateInput {
    return {
      userId: params.userId,
      operation: params.operation,
      idempotencyKey: params.key,
      requestHash: params.requestHash,
      orderId: params.orderId,
      responseStatus: params.response.status,
      responseBody: JSON.parse(JSON.stringify(params.response.body)),
    };
  }
}
