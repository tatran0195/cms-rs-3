import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodeBlock } from './code-block';

describe('CodeBlock', () => {
  const snippets = [
    {
      label: 'medusa-config.ts',
      language: 'ts',
      code: 'module.exports = defineConfig({\n  caching: true,\n})',
    },
    {
      label: 'bash',
      language: 'bash',
      code: 'claude # start',
      hideLineNumbers: true,
    },
  ];

  it('renders line numbers in the left gutter', () => {
    render(
      <CodeBlock snippets={snippets}>
        <CodeBlock.Header />
        <CodeBlock.Body />
      </CodeBlock>,
    );

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('switches snippet tabs and respects hideLineNumbers', () => {
    render(
      <CodeBlock snippets={snippets}>
        <CodeBlock.Header />
        <CodeBlock.Body />
      </CodeBlock>,
    );

    const bashTab = screen.getByRole('button', { name: 'bash' });
    fireEvent.click(bashTab);

    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByText(/claude/)).toBeInTheDocument();
  });
});
