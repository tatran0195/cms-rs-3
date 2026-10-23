import { describe, expect, it } from 'vitest';
import { createDemoTree, findDemoPage } from './demo-tree';

describe('demo-tree', () => {
  it('creates complete Fumadocs page tree structure', () => {
    const tree = createDemoTree();
    expect(tree.name).toBe('Docs');
    expect(tree.children.length).toBeGreaterThanOrEqual(2);

    const framework = tree.children.find((c) => c.type === 'folder' && c.name === 'Framework');
    expect(framework).toBeDefined();

    const apiRef = tree.children.find((c) => c.type === 'folder' && c.name === 'API Reference');
    expect(apiRef).toBeDefined();
  });

  it('locates pages correctly by path', () => {
    const tree = createDemoTree();
    const overview = findDemoPage(tree.children, '');
    expect(overview?.name).toBe('Overview');

    const tabs = findDemoPage(tree.children, 'components/tabs');
    expect(tabs?.name).toBe('Tabs');

    const cards = findDemoPage(tree.children, 'components/cards');
    expect(cards?.name).toBe('Cards');
  });

  it('falls back to overview when path not found', () => {
    const tree = createDemoTree();
    const unknown = findDemoPage(tree.children, 'non-existent-page');
    expect(unknown?.name).toBe('Overview');
  });
});
