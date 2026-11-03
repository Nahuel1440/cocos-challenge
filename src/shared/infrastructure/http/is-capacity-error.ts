import { Prisma } from '@/generated/prisma/client';

const TRANSACTION_API_ERROR = 'P2028';
const POOL_TIMEOUT_MESSAGE = 'timeout exceeded when trying to connect';

export function isCapacityError(exception: unknown): boolean {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return exception.code === TRANSACTION_API_ERROR;
  }

  return (
    exception instanceof Error && exception.message === POOL_TIMEOUT_MESSAGE
  );
}
