import type { Preview } from '@storybook/react';
import * as React from 'react';
import '../src/styles.css';
import { clx } from '../src/utils/clx';

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Global theme for components',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: 'Light' },
          { value: 'dark', icon: 'moon', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#121212' },
      ],
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme || 'light';
      const isDark = theme === 'dark';

      React.useEffect(() => {
        document.documentElement.classList.toggle('dark', isDark);
      }, [isDark]);

      return (
        <div className={clx('font-sans antialiased p-6 min-h-full transition-colors', isDark && 'dark bg-[#121212] text-white')}>
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
