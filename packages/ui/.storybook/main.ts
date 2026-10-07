import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(viteConfig) {
    viteConfig.plugins = viteConfig.plugins || [];
    viteConfig.plugins.push(tailwindcss());
    viteConfig.resolve = viteConfig.resolve || {};
    viteConfig.resolve.alias = {
      ...viteConfig.resolve.alias,
      '@': path.resolve(__dirname, '../src'),
      '@cms/ui': path.resolve(__dirname, '../src/index.ts'),
    };
    return viteConfig;
  },
};

export default config;
