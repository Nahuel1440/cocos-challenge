import { inject } from 'vitest';
import { Client } from 'pg';

// Empties every table of the public schema. seed_snapshot is left alone.
export async function truncateAllTables(): Promise<void> {
  const client = new Client({ connectionString: inject('databaseUrl') });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    if (rows.length === 0) return;
    const tables = rows.map((row) => `public."${row.tablename}"`).join(', ');
    await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
}
