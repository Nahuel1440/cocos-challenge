import type { Client } from 'pg';

export const LEDGER_LOCK_NAMESPACE = 1;
const LOCK_POLL_LIMIT_MS = 5000;
const LOCK_POLL_INTERVAL_MS = 25;

const countLedgerLockWaiters = async (client: Client, userId: number) => {
  const { rows } = await client.query<{ waiters: number }>(
    `SELECT count(*)::int AS waiters FROM pg_locks
     WHERE locktype = 'advisory' AND NOT granted
       AND classid = $1 AND objid = $2 AND objsubid = 2`,
    [LEDGER_LOCK_NAMESPACE, userId],
  );
  return rows[0]!.waiters;
};

export const waitForLedgerLockWaiters = async (
  client: Client,
  userId: number,
) => {
  const deadline = Date.now() + LOCK_POLL_LIMIT_MS;
  let waiters = await countLedgerLockWaiters(client, userId);
  while (waiters === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_INTERVAL_MS));
    waiters = await countLedgerLockWaiters(client, userId);
  }
  return waiters;
};
