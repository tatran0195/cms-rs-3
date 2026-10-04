import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/locales.ts', 'src/react.ts', 'src/standalone.ts', 'src/email.ts', 'src/site.ts'],
  format: ['esm'],
  platform: 'neutral',
  dts: true,
  clean: true,
  sourcemap: true,
});
