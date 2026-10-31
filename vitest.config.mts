import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// swc emits decorator metadata, which Nest DI needs and esbuild does not.
export default defineConfig({
  plugins: [swc.vite()],
  test: { include: ['src/**/*.spec.ts'], passWithNoTests: true },
});
