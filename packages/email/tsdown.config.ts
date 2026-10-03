import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/render.ts', 'src/translate.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  dts: true,
  clean: true,
  sourcemap: true,
});
