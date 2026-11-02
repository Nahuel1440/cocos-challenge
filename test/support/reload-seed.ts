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
      // Any column that owns a sequence, whatever its name (a table may have no `id`).
      const { rows: serials } = await client.query<{ column: string }>(
        `SELECT attname AS "column" FROM pg_attribute
         WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped
           AND pg_get_serial_sequence($2, attname) IS NOT NULL`,
        [`public."${tablename}"`, `public."${tablename}"`],
      );
      for (const { column } of serials) {
        await client.query(
          `SELECT setval(pg_get_serial_sequence($1, $2),
                         COALESCE(MAX("${column}"), 1), MAX("${column}") IS NOT NULL)
           FROM public."${tablename}"`,
          [`public."${tablename}"`, column],
        );
      }
    }
  } finally {
    await client.end();
  }
}
