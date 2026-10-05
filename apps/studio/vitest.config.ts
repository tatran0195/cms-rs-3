import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Standalone vitest config (does not load the TanStack Start vite plugins) so unit
// tests run fast in a plain node environment. The `@` alias mirrors tsconfig paths.
export default defineConfig({
  test: {
    environment: 'node',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:3000/',
      },
    },
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@/hooks': fileURLToPath(new URL('./src/shared/hooks', import.meta.url)),
      '@/services': fileURLToPath(new URL('./src/shared/services', import.meta.url)),
      '@/lib': fileURLToPath(new URL('./src/shared/lib', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
