import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// swc emits decorator metadata, which Nest DI needs and esbuild does not.
export default defineConfig({
  plugins: [swc.vite()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { include: ['src/**/*.spec.ts'], passWithNoTests: true },
});
