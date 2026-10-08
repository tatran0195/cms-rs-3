import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
  resolve: {
    alias: {
      '@cms/design-system': path.resolve(import.meta.dirname, '../design-system/src'),
      '@cms/auth': path.resolve(import.meta.dirname, './src'),
    },
  },
});
