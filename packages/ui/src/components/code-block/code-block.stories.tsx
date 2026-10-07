import { CogSixTooth, InformationCircle } from '@cms/icons';
import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { IconButton } from '../icon-button';
import { CodeBlock } from './code-block';

const meta: Meta<typeof CodeBlock> = {
  title: 'Components/CodeBlock',
  component: CodeBlock,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof CodeBlock>;

const snippets = [
  {
    label: 'cURL',
    language: 'bash',
    code: `curl -H 'x-publishable-key: YOUR_API_KEY' 'http://localhost:9000/store/products/PRODUCT_ID'`,
  },
  {
    label: 'cms JS Client',
    language: 'jsx',
    code: `// Install the JS Client in your storefront project: @cms/cms-js\n\nimport cms from "@cms/cms-js"\n\nconst cms = new cms({ publishableApiKey: "YOUR_API_KEY"})\nconst product = await cms.products.retrieve("PRODUCT_ID")\nconsole.log(product.id)`,
  },
  {
    label: 'cms React',
    language: 'tsx',
    code: `// Install the React SDK and required dependencies in your storefront project:\n// cms-react @tanstack/react-query @cms/cms\n\nimport { useProduct } from "cms-react"\n\nconst { product } = useProduct("PRODUCT_ID")\nconsole.log(product.id)`,
  },
];

export const Default: Story = {
  render: () => (
    <div className="w-[700px]">
      <CodeBlock snippets={snippets}>
        <CodeBlock.Header />
        <CodeBlock.Body>
          <span>/store/products/:id</span>
        </CodeBlock.Body>
      </CodeBlock>
    </div>
  ),
};

export const SingleSnippet: Story = {
  render: () => (
    <div className="w-[700px]">
      <CodeBlock
        snippets={[
          {
            label: 'medusa-config.ts',
            language: 'ts',
            code: 'module.exports = defineConfig({\n  // ...\n  featureFlags: {\n    caching: true,\n  },\n})',
          },
        ]}
      >
        <CodeBlock.Header>
          <IconButton size="small" variant="transparent" className="text-ui-contrast-fg-secondary hover:text-ui-contrast-fg-primary">
            <CogSixTooth />
          </IconButton>
          <IconButton size="small" variant="transparent" className="text-ui-contrast-fg-secondary hover:text-ui-contrast-fg-primary">
            <InformationCircle />
          </IconButton>
        </CodeBlock.Header>
        <CodeBlock.Body />
      </CodeBlock>
    </div>
  ),
};

export const Terminal: Story = {
  render: () => (
    <div className="w-[700px]">
      <CodeBlock
        snippets={[
          {
            label: 'Terminal',
            language: 'bash',
            code: '>  node --version',
            hideLineNumbers: true,
          },
        ]}
      >
        <CodeBlock.Header>
          <IconButton size="small" variant="transparent" className="text-ui-contrast-fg-secondary hover:text-ui-contrast-fg-primary">
            <CogSixTooth />
          </IconButton>
          <IconButton size="small" variant="transparent" className="text-ui-contrast-fg-secondary hover:text-ui-contrast-fg-primary">
            <InformationCircle />
          </IconButton>
        </CodeBlock.Header>
        <CodeBlock.Body />
      </CodeBlock>
    </div>
  ),
};

export const TabsWithTerminal: Story = {
  render: () => (
    <div className="w-[700px]">
      <CodeBlock
        snippets={[
          {
            label: 'yarn',
            language: 'bash',
            code: '>  yarn global add @medusajs/mcloud',
            hideLineNumbers: true,
          },
          {
            label: 'pnpm',
            language: 'bash',
            code: '>  pnpm add -g @medusajs/mcloud',
            hideLineNumbers: true,
          },
          {
            label: 'npm',
            language: 'bash',
            code: '>  npm install -g @medusajs/mcloud',
            hideLineNumbers: true,
          },
        ]}
      >
        <CodeBlock.Header>
          <IconButton size="small" variant="transparent" className="text-ui-contrast-fg-secondary hover:text-ui-contrast-fg-primary">
            <CogSixTooth />
          </IconButton>
          <IconButton size="small" variant="transparent" className="text-ui-contrast-fg-secondary hover:text-ui-contrast-fg-primary">
            <InformationCircle />
          </IconButton>
        </CodeBlock.Header>
        <CodeBlock.Body />
      </CodeBlock>
    </div>
  ),
};

const generateStartupLog = () => {
  const services = [
    { name: 'Models', time: 14 },
    { name: 'Repositories', time: 35 },
    { name: 'Strategies', time: 24 },
    { name: 'Modules', time: 1 },
    { name: 'Database', time: 654 },
    { name: 'Services', time: 7 },
    { name: 'Express', time: 5 },
    { name: 'Plugins', time: 7 },
    { name: 'Subscribers', time: 6 },
    { name: 'API', time: 28 },
    { name: 'Cache', time: 12 },
    { name: 'Queue', time: 45 },
    { name: 'Middleware', time: 8 },
    { name: 'WebSockets', time: 15 },
    { name: 'Authentication', time: 42 },
  ];

  const lines = services.flatMap((service) => [
    `✔ ${service.name} initialized – ${service.time}ms`,
    `✔ ${service.name} validated – ${service.time + 5}ms`,
    `✔ ${service.name} configured – ${service.time + 10}ms`,
    `✔ ${service.name} optimized – ${service.time + 3}ms`,
  ]);

  return `cms develop\n${lines.join('\n')}\n✔ Server is ready on port: 9000`;
};

const code = generateStartupLog();

export const ManyLines: Story = {
  render: () => (
    <div className="h-[300px] w-[700px]">
      <CodeBlock
        snippets={[
          {
            code,
            label: 'Test',
            language: 'bash',
            hideCopy: true,
          },
        ]}
        className="h-full"
      >
        <CodeBlock.Header />
        <CodeBlock.Body />
      </CodeBlock>
    </div>
  ),
};
