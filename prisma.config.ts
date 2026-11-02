import { defineConfig } from 'prisma/config';

// Prisma 7 does not read .env on its own.
try {
  process.loadEnvFile();
} catch {
  // no .env: DATABASE_URL must already be in the environment
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
