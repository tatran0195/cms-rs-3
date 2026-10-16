import type { NavTabItem } from '@cms/validators';
import { describe, expect, it } from 'vitest';
import { cleanTabItems, insertTabChild, moveTabNode, removeTabNode, updateTabNode } from './tabs-tree-utils';

describe('tabs-tree-utils', () => {
  const sampleTree: NavTabItem[] = [
    {
      label: 'Tab 1',
      href: '/tab-1',
      items: [
        { label: 'Sub 1.1', href: '/sub-1-1' },
        { label: 'Sub 1.2', href: '/sub-1-2' },
      ],
    },
    { label: 'Tab 2', href: '/tab-2' },
  ];

  it('updates a nested tab node', () => {
    const updated = updateTabNode(sampleTree, [0, 1], { label: 'Sub 1.2 Renamed' });
    expect(updated[0]?.items?.[1]?.label).toBe('Sub 1.2 Renamed');
    expect(sampleTree[0]?.items?.[1]?.label).toBe('Sub 1.2'); // immutability
  });

  it('inserts a child node at deep path', () => {
    const updated = insertTabChild(sampleTree, [0, 1], { label: 'Deep 1.2.1', href: '/deep' });
    expect(updated[0]?.items?.[1]?.items?.[0]?.label).toBe('Deep 1.2.1');
  });

  it('removes a nested node', () => {
    const updated = removeTabNode(sampleTree, [0, 0]);
    expect(updated[0]?.items?.length).toBe(1);
    expect(updated[0]?.items?.[0]?.label).toBe('Sub 1.2');
  });

  it('moves siblings up and down', () => {
    const movedDown = moveTabNode(sampleTree, [0, 0], 'down');
    expect(movedDown[0]?.items?.[0]?.label).toBe('Sub 1.2');
    expect(movedDown[0]?.items?.[1]?.label).toBe('Sub 1.1');

    const movedUp = moveTabNode(movedDown, [0, 1], 'up');
    expect(movedUp[0]?.items?.[0]?.label).toBe('Sub 1.1');
  });

  it('cleans empty nodes and trims whitespace recursively', () => {
    const dirtyTree: NavTabItem[] = [
      { label: '  Valid  ', href: ' /valid ', items: [{ label: '   ', href: '' }] },
      { label: '', href: '' },
    ];
    const cleaned = cleanTabItems(dirtyTree);
    expect(cleaned).toEqual([{ label: 'Valid', href: '/valid' }]);
  });
});
