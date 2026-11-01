import { defineConfig, env } from 'prisma/config';

// Prisma 7 does not read .env on its own.
try {
  process.loadEnvFile();
} catch {
  // no .env: DATABASE_URL must already be in the environment
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
