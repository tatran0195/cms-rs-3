import type { NavTabItem } from '@cms/validators';

export function updateTabNode(tree: NavTabItem[], path: number[], patch: Partial<NavTabItem>): NavTabItem[] {
  if (path.length === 0) return tree;
  const [index, ...rest] = path;
  return tree.map((node, i) => {
    if (i !== index) return node;
    if (rest.length === 0) {
      return { ...node, ...patch };
    }
    return {
      ...node,
      items: updateTabNode(node.items ?? [], rest, patch),
    };
  });
}

export function insertTabChild(tree: NavTabItem[], path: number[], newChild: NavTabItem): NavTabItem[] {
  if (path.length === 0) {
    return [...tree, newChild];
  }
  const [index, ...rest] = path;
  return tree.map((node, i) => {
    if (i !== index) return node;
    if (rest.length === 0) {
      return {
        ...node,
        items: [...(node.items ?? []), newChild],
      };
    }
    return {
      ...node,
      items: insertTabChild(node.items ?? [], rest, newChild),
    };
  });
}

export function removeTabNode(tree: NavTabItem[], path: number[]): NavTabItem[] {
  if (path.length === 0) return tree;
  const [index, ...rest] = path;
  if (rest.length === 0) {
    return tree.filter((_, i) => i !== index);
  }
  return tree.map((node, i) => {
    if (i !== index) return node;
    return {
      ...node,
      items: removeTabNode(node.items ?? [], rest),
    };
  });
}

export function moveTabNode(tree: NavTabItem[], path: number[], direction: 'up' | 'down'): NavTabItem[] {
  if (path.length === 0) return tree;
  const [index, ...rest] = path;
  if (rest.length === 0) {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tree.length) return tree;
    const next = [...tree];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    return next;
  }
  return tree.map((node, i) => {
    if (i !== index) return node;
    return {
      ...node,
      items: moveTabNode(node.items ?? [], rest, direction),
    };
  });
}

export function cleanTabItems(items: NavTabItem[]): NavTabItem[] {
  return items
    .map((item) => {
      const cleanedLabel = item.label?.trim() ?? '';
      const cleanedHref = item.href?.trim() ?? '';
      const cleanedChildren = item.items ? cleanTabItems(item.items) : [];

      if (!cleanedLabel && !cleanedHref && cleanedChildren.length === 0) {
        return null;
      }

      const res: NavTabItem = {
        label: cleanedLabel,
        href: cleanedHref || undefined,
        external: item.external ? true : undefined,
      };

      if (cleanedChildren.length > 0) {
        res.items = cleanedChildren;
      }

      return res;
    })
    .filter((item): item is NavTabItem => item !== null && item.label.length > 0);
}
