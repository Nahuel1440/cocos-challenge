import { Prisma } from '@/generated/prisma/client';

const TRANSACTION_API_ERROR = 'P2028';
const POOL_TIMEOUT_MESSAGES = new Set([
  'timeout exceeded when trying to connect',
  'Connection terminated due to connection timeout',
]);

export function isCapacityError(exception: unknown): boolean {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return exception.code === TRANSACTION_API_ERROR;
  }

  return (
    exception instanceof Error && POOL_TIMEOUT_MESSAGES.has(exception.message)
  );
}
