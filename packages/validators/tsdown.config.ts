import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/addons.ts', 'src/redirects.ts'],
  format: ['esm'],
  platform: 'neutral',
  dts: true,
  clean: true,
  sourcemap: true,
});
