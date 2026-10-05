import tailwindcss from '@tailwindcss/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '../../dist/reader',
    emptyOutDir: true,
  },
  resolve: { tsconfigPaths: true },
  server: {
    host: '0.0.0.0',
    port: 4312,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  plugins: [tailwindcss(), viteReact({ compiler: true })],
});
