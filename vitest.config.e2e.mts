import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['test/**/*.e2e-spec.ts', 'test/**/*.int-spec.ts'],
    // One container per run shared by every file: files must not truncate each other.
    fileParallelism: false,
    setupFiles: ['test/support/set-database-url.ts'],
    globalSetup: ['test/support/postgres-global-setup.ts'],
    passWithNoTests: true,
  },
});
