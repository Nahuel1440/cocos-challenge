import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { include: ['test/**/*.e2e-spec.ts'], passWithNoTests: true },
});
