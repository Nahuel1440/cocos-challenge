import { defineConfig } from 'prisma/config';
import { assertLocalDatabaseUrl } from './prisma/assert-local-database-url';

// Prisma 7 does not read .env on its own.
try {
  process.loadEnvFile();
} catch {
  // no .env: DATABASE_URL must already be in the environment
}

assertLocalDatabaseUrl(process.env.DATABASE_URL, process.env.ALLOW_REMOTE_DB);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
