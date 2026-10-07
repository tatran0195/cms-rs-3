import { paraglideVitePlugin } from '@inlang/paraglide-js';
import mdx from '@mdx-js/rollup';
import { createEnv } from '@t3-oss/env-core';
import tailwindcss from '@tailwindcss/vite';
import tanstackRouter from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import { parse as parseToml } from 'smol-toml';
import { defineConfig, loadEnv } from 'vite';
import { z } from 'zod';
import { bundleAnalysisPlugin } from './scripts/bundle-analysis-plugin.ts';

export default defineConfig(({ mode }) => {
  const configEnv = createEnv({
    server: { VITE_API_URL: z.url().default('http://localhost:3000') },
    runtimeEnv: loadEnv(mode, process.cwd(), ''),
    emptyStringAsUndefined: true,
  });
  const apiTarget = configEnv.VITE_API_URL;

  return {
    build: {
      outDir: '../../dist/frontend',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.replaceAll('\\', '/');
            if (/\/packages\/i18n\/src\/paraglide\/messages\/site_/.test(normalized)) {
              return 'public-site-i18n';
            }
            if (
              /\/packages\/i18n\/src\/paraglide\/messages\/(?:common_loading|error_(?:backhome|badge|title|tryagain|unexpected)|notfound_(?:backhome|badge|body|title))\.js$/.test(
                normalized,
              )
            ) {
              return 'standalone-i18n';
            }
          },
        },
      },
    },
    resolve: {
      alias: {
        '@/hooks': fileURLToPath(new URL('./src/shared/hooks', import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@cms/sdk': fileURLToPath(new URL('../../packages/sdk/src/index.ts', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 4310,
      allowedHosts: true,
      watch: {
        ignored: ['**/node_modules/**', '**/.git/**', '**/packages/i18n/src/paraglide/**'],
      },
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@tanstack/react-router',
        '@tanstack/react-query',
        'lucide-react',
        'sonner',
        'use-sync-external-store',
        'use-sync-external-store/shim',
      ],
    },
    plugins: [
      paraglideVitePlugin({
        project: '../../packages/i18n/project.inlang',
        outdir: '../../packages/i18n/src/paraglide',
        emitTsDeclarations: true,
        outputStructure: 'message-modules',
        strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
        cookieName: 'CMS_LOCALE',
      }),
      bundleAnalysisPlugin(),
      {
        enforce: 'pre',
        ...mdx({ remarkPlugins: [remarkFrontmatter, [remarkMdxFrontmatter, { name: 'frontmatter', parsers: { toml: parseToml } }], remarkGfm] }),
      },
      tailwindcss(),
      tanstackRouter({
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
        routeFileIgnorePrefix: '-',
        routeFileIgnorePattern: '\\.test\\.(ts|tsx)$',
      }),
      viteReact({ compiler: true }),
    ],
  };
});
