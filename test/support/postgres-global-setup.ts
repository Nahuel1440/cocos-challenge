import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

// 0_init only holds the CREATE TABLEs that database.sql already ran (it is a baseline).
const BASELINE = '0_init';

async function applyMigrations(client: Client, root: string): Promise<void> {
  const migrationsDir = path.join(root, 'prisma/migrations');
  const names = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== BASELINE)
    .map((entry) => entry.name)
    .sort();
  for (const name of names) {
    const sql = await readFile(
      path.join(migrationsDir, name, 'migration.sql'),
      'utf8',
    );
    await client.query(sql);
  }
}

// Copies the post-migration rows, so a reload gives the data the app sees after
// `prisma migrate deploy`, including the one-time UPDATE of order 6.
async function snapshotSeed(client: Client): Promise<void> {
  await client.query('CREATE SCHEMA seed_snapshot');
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  for (const { tablename } of rows) {
    await client.query(
      `CREATE TABLE seed_snapshot."${tablename}" AS TABLE public."${tablename}"`,
    );
  }
}

// One container per run: Postgres 17, the same image as docker-compose.yml (D-19).
export default async function setup(project: TestProject) {
  const root = project.config.root;
  const container = await new PostgreSqlContainer('postgres:17')
    .withUsername('cocos')
    .withPassword('cocos')
    .withDatabase('cocos')
    .withCopyFilesToContainer([
      {
        source: path.join(root, 'database.sql'),
        target: '/docker-entrypoint-initdb.d/database.sql',
      },
    ])
    .start();

  const databaseUrl = container.getConnectionUri();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await applyMigrations(client, root);
    await snapshotSeed(client);
  } finally {
    await client.end();
  }

  project.provide('databaseUrl', databaseUrl);
  return async () => {
    await container.stop();
  };
}
