import { Button } from '@cms/design-system/components/ui/button';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import type { PageNode } from '@cms/sdk';
import { hasIcon, PageIcon } from '@cms/site';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, FileText, Folder, GripVertical, Layers, Plus, Settings2 } from 'lucide-react';
import { type CSSProperties, memo, useEffect, useMemo, useRef, useState } from 'react';

/**
 * A Notion-style page tree with @dnd-kit: drag the handle to reorder, drag
 * horizontally to nest/un-nest (the projected parent is previewed live), with a
 * floating drag overlay. Emits the full reorder set ({id, parentId, position})
 * which the editor sends to the reorderPages mutation. Children of a dragged
 * node move with it (they're hidden from the list while dragging and keep their
 * parentId on drop).
 */

const INDENT = 16;

export interface Flat {
  id: string;
  parentId: string | null;
  depth: number;
  node: PageNode;
}

export function flatten(pages: PageNode[]): Flat[] {
  const byParent = new Map<string, PageNode[]>();
  for (const page of pages) {
    const key = page.parentId ?? '__root';
    const list = byParent.get(key) ?? [];
    list.push(page);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.position - b.position);
  }
  const out: Flat[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const node of byParent.get(parentId ?? '__root') ?? []) {
      out.push({ id: node.id, parentId, depth, node });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Hide the descendants of `id` from the list (so a subtree drags as a unit). */
export function removeDescendants(items: Flat[], id: string): Flat[] {
  const excluded = new Set([id]);
  return items.filter((item) => {
    if (item.parentId && excluded.has(item.parentId)) {
      excluded.add(item.id);
      return false;
    }
    return true;
  });
}

/** Hide the descendants of any collapsed group (relies on tree order: a parent
 *  always precedes its children in the flattened list). */
export function hideCollapsed(items: Flat[], collapsed: Set<string>): Flat[] {
  if (collapsed.size === 0) {
    return items;
  }
  const hidden = new Set<string>();
  return items.filter((item) => {
    if (item.parentId && (collapsed.has(item.parentId) || hidden.has(item.parentId))) {
      hidden.add(item.id);
      return false;
    }
    return true;
  });
}

const collapsedStoreKey = (treeKey: string) => `cms.editor.collapsedGroups:${treeKey}`;

function readCollapsed(treeKey?: string): Set<string> {
  if (typeof window === 'undefined' || !treeKey) {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(collapsedStoreKey(treeKey));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export interface Projection {
  depth: number;
  parentId: string | null;
}

export function getProjection(items: Flat[], activeId: string, overId: string, dragOffset: number, indent: number): Projection {
  const overIndex = items.findIndex((i) => i.id === overId);
  const activeIndex = items.findIndex((i) => i.id === activeId);
  if (overIndex < 0 || activeIndex < 0) {
    const activeItem = items.find((i) => i.id === activeId);
    return { depth: activeItem?.depth ?? 0, parentId: activeItem?.parentId ?? null };
  }
  const activeItem = items[activeIndex];
  if (!activeItem) {
    return { depth: 0, parentId: null };
  }
  const isTab = activeItem.id.startsWith('__tab__');
  const hasTabs = items.some((it) => it.id.startsWith('__tab__'));

  // 1. Tab items are strictly top-level navigation sections (depth 0, parentId null).
  if (isTab) {
    return { depth: 0, parentId: null };
  }

  // 2. Non-tab items (pages and groups) must sit INSIDE tabs if tabs exist.
  // Tabs are the top level of navigation, other items sit inside them.
  const newItems = arrayMove(items, activeIndex, overIndex);
  const previousItem = newItems[overIndex - 1];
  const nextItem = newItems[overIndex + 1];
  const dragDepth = Math.round(dragOffset / indent);
  const projectedDepth = (activeItem?.depth ?? 0) + dragDepth;

  const minAllowedDepth = hasTabs ? 1 : 0;
  const maxDepth = previousItem ? previousItem.depth + 1 : minAllowedDepth;
  const minDepth = Math.max(minAllowedDepth, nextItem ? nextItem.depth : minAllowedDepth);
  let depth = projectedDepth > maxDepth ? maxDepth : projectedDepth < minDepth ? minDepth : projectedDepth;
  if (hasTabs && depth < 1) {
    depth = 1;
  }

  const parentId = (() => {
    if (!hasTabs && (depth === 0 || !previousItem)) {
      return null;
    }
    if (previousItem) {
      if (depth === previousItem.depth) {
        return previousItem.parentId;
      }
      if (depth > previousItem.depth) {
        return previousItem.id;
      }
      const matchingAncestor = newItems
        .slice(0, overIndex)
        .reverse()
        .find((item) => item.depth === depth);
      if (matchingAncestor) {
        return matchingAncestor.parentId;
      }
      if (hasTabs) {
        const precedingTab = newItems
          .slice(0, overIndex)
          .reverse()
          .find((item) => item.id.startsWith('__tab__'));
        if (precedingTab) {
          return precedingTab.id;
        }
      }
      return null;
    }
    if (hasTabs) {
      const firstTab = newItems.find((item) => item.id.startsWith('__tab__'));
      return firstTab?.id ?? null;
    }
    return null;
  })();

  return { depth, parentId };
}

export interface ReorderItem {
  id: string;
  parentId: string | null;
  position: number;
}

/**
 * Reorders a hierarchical page tree while moving an entire subtree as a unit.
 * Preserves hidden/collapsed descendants and re-indexes 0-based positions per parent.
 */
export function reorderTree({
  flatFull,
  flat,
  activeId,
  overId,
  projection,
}: {
  flatFull: Flat[];
  flat: Flat[];
  activeId: string;
  overId: string;
  projection: Projection;
}): ReorderItem[] {
  const activeIndex = flat.findIndex((f) => f.id === activeId);
  const overIndex = flat.findIndex((f) => f.id === overId);
  if (activeIndex < 0 || overIndex < 0) {
    return [];
  }

  // 1. Move active item in the visible flat list
  const movedFlat = arrayMove(flat, activeIndex, overIndex);

  // 2. Pre-index child lookup table for O(1) subtree discovery
  const childrenMap = new Map<string, string[]>();
  for (const item of flatFull) {
    if (item.parentId) {
      const list = childrenMap.get(item.parentId) ?? [];
      list.push(item.id);
      childrenMap.set(item.parentId, list);
    }
  }

  // Pre-calculate all descendants per subtree
  const allDescendantsMap = new Map<string, Set<string>>();
  const getDescendantSet = (rootId: string): Set<string> => {
    const cached = allDescendantsMap.get(rootId);
    if (cached) return cached;
    const set = new Set<string>();
    const stack = [...(childrenMap.get(rootId) ?? [])];
    while (stack.length > 0) {
      const child = stack.pop();
      if (!child) continue;
      set.add(child);
      const grandchildren = childrenMap.get(child);
      if (grandchildren) {
        for (const gc of grandchildren) {
          set.add(gc);
          stack.push(gc);
        }
      }
    }
    allDescendantsMap.set(rootId, set);
    return set;
  };

  const activeDescendantSet = getDescendantSet(activeId);
  const activeDescendants = flatFull.filter((item) => activeDescendantSet.has(item.id));

  // Other hidden descendants (e.g. collapsed groups) that were not in visible flat
  const flatIdSet = new Set(flat.map((f) => f.id));
  const otherHiddenItems = flatFull.filter((item) => !flatIdSet.has(item.id) && !activeDescendantSet.has(item.id));

  // Build the complete ordered list
  const fullOrdered: Array<{ id: string; parentId: string | null }> = [];
  const inserted = new Set<string>();

  for (const item of movedFlat) {
    if (item.id === activeId) {
      fullOrdered.push({
        id: item.id,
        parentId: projection.parentId,
      });
      inserted.add(item.id);
      for (const desc of activeDescendants) {
        fullOrdered.push({
          id: desc.id,
          parentId: desc.parentId,
        });
        inserted.add(desc.id);
      }
    } else {
      fullOrdered.push({
        id: item.id,
        parentId: item.parentId,
      });
      inserted.add(item.id);
    }

    // Attach any collapsed/hidden descendants for this item
    const itemDescendantSet = getDescendantSet(item.id);
    const hiddenDescendants = otherHiddenItems.filter((h) => !inserted.has(h.id) && itemDescendantSet.has(h.id));
    for (const h of hiddenDescendants) {
      fullOrdered.push({
        id: h.id,
        parentId: h.parentId,
      });
      inserted.add(h.id);
    }
  }

  // Safety fallback for any unvisited items
  for (const item of flatFull) {
    if (!inserted.has(item.id)) {
      fullOrdered.push({
        id: item.id,
        parentId: item.parentId,
      });
      inserted.add(item.id);
    }
  }

  // Assign 0-based positions per parent
  const posByParent = new Map<string, number>();
  return fullOrdered.map((it) => {
    const key = it.parentId ?? '__root';
    const position = posByParent.get(key) ?? 0;
    posByParent.set(key, position + 1);
    return { id: it.id, parentId: it.parentId, position };
  });
}

export function SortablePageTree({
  pages,
  activeId,
  onSelect,
  onAddChild,
  onSettings,
  onMove,
  onInsertAfter,
  onInsertBefore,
  treeKey,
}: {
  pages: PageNode[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onSettings: (id: string) => void;
  onMove: (items: Array<{ id: string; parentId: string | null; position: number }>) => void;
  onInsertAfter?: (node: PageNode, parentId: string | null) => void;
  onInsertBefore?: (node: PageNode, parentId: string | null) => void;
  /** Namespace for persisting which groups are collapsed (e.g. the language id). */
  treeKey?: string;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);

  // Which GROUP rows are collapsed (their children hidden). Persisted per tree.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed(treeKey));
  const toggleCollapse = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setCollapsed(next);
    if (treeKey) {
      try {
        window.localStorage.setItem(collapsedStoreKey(treeKey), JSON.stringify([...next]));
      } catch {
        // ignore storage failures (private mode etc.)
      }
    }
  };

  // Sync collapsed state when treeKey changes
  useEffect(() => {
    setCollapsed(readCollapsed(treeKey));
  }, [treeKey]);

  const flatFull = useMemo(() => flatten(pages), [pages]);

  const prevActiveIdRef = useRef<string | null>(null);

  // Set of group/tab IDs that currently have the activeId as a descendant
  const activeAncestorIds = useMemo(() => {
    if (!activeId) return new Set<string>();
    const parentMap = new Map<string, string | null>();
    for (const item of flatFull) {
      parentMap.set(item.id, item.parentId);
    }
    const set = new Set<string>();
    let curr = parentMap.get(activeId);
    while (curr) {
      set.add(curr);
      curr = parentMap.get(curr);
    }
    return set;
  }, [activeId, flatFull]);

  // Automatically expand any collapsed ancestor groups ONLY when navigating to a new activeId
  useEffect(() => {
    if (!activeId || activeId === prevActiveIdRef.current) {
      prevActiveIdRef.current = activeId;
      return;
    }
    prevActiveIdRef.current = activeId;

    const parentMap = new Map<string, string | null>();
    for (const item of flatFull) {
      parentMap.set(item.id, item.parentId);
    }
    let curr = parentMap.get(activeId);
    const toUncollapse: string[] = [];
    while (curr) {
      if (collapsed.has(curr)) {
        toUncollapse.push(curr);
      }
      curr = parentMap.get(curr);
    }
    if (toUncollapse.length > 0) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        for (const id of toUncollapse) {
          next.delete(id);
        }
        if (treeKey) {
          try {
            window.localStorage.setItem(collapsedStoreKey(treeKey), JSON.stringify([...next]));
          } catch {
            // ignore storage failures
          }
        }
        return next;
      });
    }
  }, [activeId, flatFull, treeKey, collapsed.has]);
  // Ids of nodes that have at least one child (so only those get a collapse chevron).
  const parentIds = useMemo(() => {
    const set = new Set<string>();
    for (const item of flatFull) {
      if (item.parentId) {
        set.add(item.parentId);
      }
    }
    return set;
  }, [flatFull]);
  // Hide collapsed groups' descendants, then (while dragging) the dragged subtree.
  const visible = useMemo(() => hideCollapsed(flatFull, collapsed), [flatFull, collapsed]);
  const flat = useMemo(() => (draggingId ? removeDescendants(visible, draggingId) : visible), [visible, draggingId]);
  const ids = flat.map((f) => f.id);

  const projection = draggingId && overId ? getProjection(flat, draggingId, overId, offsetLeft, INDENT) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const reset = () => {
    setDraggingId(null);
    setOverId(null);
    setOffsetLeft(0);
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setDraggingId(String(active.id));
    setOverId(String(active.id));
  };
  const onDragMove = ({ delta }: DragMoveEvent) => setOffsetLeft(delta.x);
  const onDragOver = ({ over }: DragOverEvent) => {
    setOverId(over ? String(over.id) : null);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const finalOverId = over ? String(over.id) : null;
    const finalActiveId = String(active.id);

    // Compute fresh projection directly using actual drop targets to avoid stale render timing
    const currentProjection = finalOverId ? getProjection(flat, finalActiveId, finalOverId, offsetLeft, INDENT) : null;

    reset();

    if (!currentProjection || !finalOverId) {
      return;
    }

    const items = reorderTree({
      flatFull,
      flat,
      activeId: finalActiveId,
      overId: finalOverId,
      projection: currentProjection,
    });

    if (items.length > 0) {
      onMove(items);
    }
  };

  const draggingNode = draggingId ? flatFull.find((f) => f.id === draggingId)?.node : null;

  // Windowed Virtualization using @tanstack/react-virtual for scaling to 10,000+ items
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  // Automatically scroll to activeId when it changes or when flat updates
  useEffect(() => {
    if (!activeId) return;
    const targetIndex = flat.findIndex((item) => item.id === activeId);
    if (targetIndex >= 0) {
      virtualizer.scrollToIndex(targetIndex, { align: 'auto' });
    }
  }, [activeId, flat, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  // Resilient fallback for testing/jsdom environments where ResizeObserver does not compute DOM layout heights
  const fallbackLimit = typeof window !== 'undefined' && (globalThis as any).IS_REACT_ACT_ENVIRONMENT ? 50 : 30;
  const displayItems =
    virtualItems.length > 0
      ? virtualItems
      : flat.slice(0, fallbackLimit).map((_, i) => ({
          key: i,
          index: i,
          start: i * 32,
          size: 32,
        }));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={parentRef} className="relative h-full flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] px-1 py-1">
          <div
            style={{
              height: `${virtualizer.getTotalSize() || flat.length * 32}px`,
              position: 'relative',
              width: '100%',
            }}
          >
            {displayItems.map((virtualRow) => {
              const item = flat[virtualRow.index];
              if (!item) return null;
              const isFirst = virtualRow.index === 0;
              const isGroup = item.node.kind === 'GROUP';
              const isCollapsed = collapsed.has(item.id);
              const insertParentIdAfter = isGroup && !isCollapsed ? item.id : item.parentId;

              return (
                <div
                  key={item.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <SortableRow
                    id={item.id}
                    node={item.node}
                    depth={item.id === draggingId && projection ? projection.depth : item.depth}
                    active={activeId === item.id}
                    hasActiveChild={collapsed.has(item.id) && activeAncestorIds.has(item.id)}
                    hasChildren={parentIds.has(item.id)}
                    collapsed={collapsed.has(item.id)}
                    isFirst={isFirst}
                    onToggleCollapse={toggleCollapse}
                    onSelect={onSelect}
                    onAddChild={onAddChild}
                    onSettings={onSettings}
                    onInsertAfter={!draggingId && onInsertAfter ? (node) => onInsertAfter(node, insertParentIdAfter) : undefined}
                    onInsertBefore={!draggingId && onInsertBefore ? (node) => onInsertBefore(node, item.parentId) : undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </SortableContext>
      <DragOverlay>{draggingNode ? <RowPresentation node={draggingNode} depth={0} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

const TreeInserter = memo(function TreeInserter({ depth, position, onClick }: { depth: number; position: 'top' | 'bottom'; onClick: () => void }) {
  const t = useT();
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onClick();
  };

  return (
    <button
      type="button"
      aria-label={t('editor.newPage')}
      title={t('editor.newPage')}
      onClick={handleClick}
      className={cn(
        'group/inserter absolute inset-x-0 z-20 flex h-4 items-center cursor-pointer pointer-events-auto border-none bg-transparent p-0',
        position === 'bottom'
          ? 'opacity-0 group-hover/item:opacity-100 hover:!opacity-100 focus-visible:opacity-100 transition-opacity duration-150 -bottom-2'
          : 'opacity-0 hover:!opacity-100 focus-visible:opacity-100 transition-opacity duration-150 -top-2',
      )}
      data-testid="tree-item-inserter"
    >
      <span
        aria-hidden="true"
        className="h-0.5 flex-1 bg-primary/40 group-hover/inserter:bg-primary transition-colors duration-150"
        style={{ marginInlineStart: depth * INDENT + 6 }}
      />
      <span
        aria-hidden="true"
        className="relative mx-1.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-background text-primary shadow-xs transition-all duration-150 group-hover/inserter:scale-115 group-hover/inserter:border-primary group-hover/inserter:bg-primary group-hover/inserter:text-primary-foreground group-hover/inserter:shadow-sm active:scale-95"
      >
        <Plus className="size-2.5 stroke-[2.5]" />
      </span>
      <span aria-hidden="true" className="h-0.5 flex-1 bg-primary/40 group-hover/inserter:bg-primary transition-colors duration-150" />
    </button>
  );
});

const SortableRow = memo(function SortableRow({
  id,
  node,
  depth,
  active,
  hasActiveChild,
  hasChildren,
  collapsed,
  isFirst,
  onToggleCollapse,
  onSelect,
  onAddChild,
  onSettings,
  onInsertAfter,
  onInsertBefore,
}: {
  id: string;
  node: PageNode;
  depth: number;
  active: boolean;
  hasActiveChild?: boolean;
  hasChildren: boolean;
  collapsed: boolean;
  isFirst?: boolean;
  onToggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onSettings: (id: string) => void;
  onInsertAfter?: (node: PageNode) => void;
  onInsertBefore?: (node: PageNode) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  // Apply dnd-kit transform (drag delta only). contentVisibility/containIntrinsicSize are
  // intentionally omitted — they cause getBoundingClientRect() to return zero rects for
  // off-screen items, breaking collision detection.
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    // Prevent text selection while the drag sensor is active on this row.
    userSelect: isDragging ? 'none' : undefined,
    WebkitUserSelect: isDragging ? 'none' : undefined,
  };
  const isGroupChildInsert = node.kind === 'GROUP' && !collapsed;
  const inserterDepthAfter = isGroupChildInsert ? depth + 1 : depth;

  return (
    <div ref={setNodeRef} style={style} className={cn('relative w-full group/item', isDragging ? 'z-50' : 'hover:z-30')}>
      <RowPresentation
        node={node}
        depth={depth}
        active={active}
        hasActiveChild={hasActiveChild}
        hasChildren={hasChildren}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        onSelect={onSelect}
        onAddChild={onAddChild}
        onSettings={onSettings}
        handleProps={{ ...attributes, ...listeners }}
      />
      {!isDragging && onInsertBefore && isFirst && !node.id.startsWith('__tab__') ? (
        <TreeInserter depth={depth} position="top" onClick={() => onInsertBefore(node)} />
      ) : null}
      {!isDragging && onInsertAfter ? <TreeInserter depth={inserterDepthAfter} position="bottom" onClick={() => onInsertAfter(node)} /> : null}
    </div>
  );
});

const RowPresentation = memo(function RowPresentation({
  node,
  depth,
  active,
  hasActiveChild,
  overlay,
  hasChildren,
  collapsed,
  onToggleCollapse,
  onSelect,
  onAddChild,
  onSettings,
  handleProps,
}: {
  node: PageNode;
  depth: number;
  active?: boolean;
  hasActiveChild?: boolean;
  overlay?: boolean;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
  onSelect?: (id: string) => void;
  onAddChild?: (parentId: string) => void;
  onSettings?: (id: string) => void;
  handleProps?: Record<string, unknown>;
}) {
  const t = useT();
  const isGroup = node.kind === 'GROUP';
  const label = node.config?.sidebarTitle?.trim() || node.title;
  const collapsible = isGroup && hasChildren && Boolean(onToggleCollapse);
  return (
    <div
      className={cn(
        'group/row flex items-center gap-1 rounded-md pe-1',
        overlay && 'bg-card shadow-lg ring-1 ring-border',
        !overlay && active && 'bg-primary/10 font-medium text-primary',
        !overlay && !active && hasActiveChild && 'bg-primary/5 font-medium text-primary/90',
        !overlay && !active && !hasActiveChild && 'text-foreground/80 hover:bg-muted hover:text-foreground',
      )}
      style={{ marginInlineStart: depth * INDENT }}
      data-testid={overlay ? undefined : 'page-row'}
      data-page-id={overlay ? undefined : node.id}
      data-page-kind={node.kind}
      data-page-slug={node.slug}
      data-page-path={node.path}
    >
      <button
        type="button"
        aria-label={t('editor.dragToReorder')}
        className="flex size-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover/row:opacity-100 active:cursor-grabbing touch-none select-none"
        {...handleProps}
      >
        <GripVertical className="size-3.5" />
      </button>
      {/* Collapse chevron for groups with children; a spacer otherwise so every
          row's icon stays aligned. */}
      {collapsible ? (
        <button
          type="button"
          aria-label={collapsed ? t('editor.expand') : t('editor.collapse')}
          aria-expanded={!collapsed}
          className="flex size-4 shrink-0 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapse?.(node.id);
          }}
        >
          {/* expanded → points down (both dirs); collapsed → points to the reading
              start (right in LTR, left in RTL). */}
          <ChevronRight className={cn('size-3.5 transition-transform', collapsed ? 'rtl:rotate-180' : 'rotate-90')} />
        </button>
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
      <button
        type="button"
        onClick={() => {
          if (node.id.startsWith('__tab__')) {
            onToggleCollapse?.(node.id);
            onSelect?.(node.id);
          } else {
            onSelect?.(node.id);
          }
        }}
        className={cn('flex min-w-0 flex-1 items-center gap-2 py-1.5 text-start text-sm', isGroup && 'font-semibold')}
      >
        {node.icon === 'Layers' || node.id.startsWith('__tab__') ? (
          <Layers className="size-3.5 shrink-0 text-primary/80" />
        ) : isGroup ? (
          <Folder className={cn('size-3.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
        ) : hasIcon(node.icon) ? (
          <PageIcon name={node.icon} className={cn('size-3.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
        ) : (
          <FileText className={cn('size-3.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
        )}
        <span className="truncate">{label}</span>
      </button>
      {!overlay && onSettings ? (
        <Button
          size="icon-xs"
          variant="ghost"
          className="shrink-0 cursor-pointer opacity-0 group-hover/row:opacity-100"
          onClick={() => onSettings(node.id)}
          title={t('editor.pageSettings.title')}
          aria-label={t('editor.pageSettings.title')}
        >
          <Settings2 className="size-3" />
        </Button>
      ) : null}
      {isGroup && onAddChild ? (
        <Button
          size="icon-xs"
          variant="ghost"
          className="shrink-0 cursor-pointer opacity-0 group-hover/row:opacity-100"
          onClick={() => onAddChild(node.id)}
          title={t('editor.newPage')}
          aria-label={t('editor.newPage')}
        >
          <Plus className="size-3" />
        </Button>
      ) : null}
    </div>
  );
});
