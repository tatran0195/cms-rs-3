/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { PageTreeSkeleton } from './page-tree-skeleton';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
});

describe('PageTreeSkeleton', () => {
  it('renders matching mock skeleton rows with correct depths', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<PageTreeSkeleton count={8} />);
    });

    const rows = container.querySelectorAll('[data-testid="page-tree-skeleton-row"]');
    expect(rows.length).toBe(8);
  });
});
