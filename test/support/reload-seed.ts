import { inject } from 'vitest';
import { Client } from 'pg';

// Copies the post-migration rows back from seed_snapshot and moves each id sequence
// past them. Call it after truncateAllTables.
export async function reloadSeed(): Promise<void> {
  const client = new Client({ connectionString: inject('databaseUrl') });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'seed_snapshot'",
    );
    // Foreign keys are not checked while copying, so the table order does not matter.
    await client.query("SET session_replication_role = 'replica'");
    for (const { tablename } of rows) {
      await client.query(
        `INSERT INTO public."${tablename}" SELECT * FROM seed_snapshot."${tablename}"`,
      );
      await client.query(
        `SELECT setval(pg_get_serial_sequence('public."${tablename}"', 'id'),
                       COALESCE(MAX(id), 1), MAX(id) IS NOT NULL)
         FROM public."${tablename}"`,
      );
    }
  } finally {
    await client.end();
  }
}
