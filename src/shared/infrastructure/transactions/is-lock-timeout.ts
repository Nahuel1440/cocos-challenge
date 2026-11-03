import { Prisma } from '@/generated/prisma/client';

const RAW_QUERY_FAILED = 'P2010';
const LOCK_NOT_AVAILABLE = '55P03';

interface DriverAdapterMeta {
  driverAdapterError?: { cause?: { originalCode?: string } };
}

export function isLockTimeout(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const meta = error.meta as DriverAdapterMeta | undefined;

  return (
    error.code === RAW_QUERY_FAILED &&
    meta?.driverAdapterError?.cause?.originalCode === LOCK_NOT_AVAILABLE
  );
}
