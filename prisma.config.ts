import { defineConfig } from 'prisma/config';
import { assertLocalDatabaseUrl } from './prisma/assert-local-database-url';

// Read before .env is loaded: the override works from the shell only, never from a file.
const allowRemote = process.env.ALLOW_REMOTE_DB;

// Prisma 7 does not read .env on its own.
try {
  process.loadEnvFile();
} catch {
  // no .env: DATABASE_URL must already be in the environment
}

assertLocalDatabaseUrl(process.env.DATABASE_URL, allowRemote, process.argv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
