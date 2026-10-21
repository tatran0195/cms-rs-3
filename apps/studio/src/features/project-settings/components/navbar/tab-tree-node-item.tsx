import { Button } from '@cms/design-system/components/ui/button';
import { Input } from '@cms/design-system/components/ui/input';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import type { NavTabItem } from '@cms/validators';
import { ChevronDown, ChevronRight, ChevronUp, CornerDownRight, ExternalLink, X } from 'lucide-react';
import { useState } from 'react';
import { FIELD_COMPACT, FIELD_COMPACT_MONO } from '../shared';
import { insertTabChild, moveTabNode, removeTabNode, updateTabNode } from '../tabs-tree-utils';

export interface TabTreeNodeProps {
  item: NavTabItem;
  path: number[];
  depth: number;
  isFirst: boolean;
  isLast: boolean;
  direction?: 'ltr' | 'rtl';
  tree: NavTabItem[];
  onChange: (next: NavTabItem[]) => void;
}

export function TabTreeNodeItem({ item, path, depth, isFirst, isLast, direction, tree, onChange }: TabTreeNodeProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(true);
  const hasChildren = Boolean(item.items && item.items.length > 0);

  const handleUpdate = (patch: Partial<NavTabItem>) => {
    onChange(updateTabNode(tree, path, patch));
  };

  const handleAddChild = () => {
    onChange(insertTabChild(tree, path, { label: '', href: '' }));
    setExpanded(true);
  };

  const handleRemove = () => {
    onChange(removeTabNode(tree, path));
  };

  const handleMove = (dir: 'up' | 'down') => {
    onChange(moveTabNode(tree, path, dir));
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card/60 p-2 text-xs transition-colors hover:border-border">
        {/* Expand / collapse or bullet spacer */}
        {hasChildren ? (
          <Button
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </Button>
        ) : (
          <span className="grid size-6 shrink-0 place-items-center font-bold text-muted-foreground/40">•</span>
        )}

        {/* Depth Badge */}
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">L{depth + 1}</span>

        {/* Label Input */}
        <Input
          className={cn(FIELD_COMPACT, 'min-w-[130px] flex-1')}
          dir={direction ?? 'auto'}
          onChange={(e) => handleUpdate({ label: e.target.value })}
          placeholder={t('settings.navbar.tabs.labelPlaceholder')}
          value={item.label}
        />

        {/* URL Input */}
        <Input
          className={cn(FIELD_COMPACT_MONO, 'min-w-[140px] flex-1')}
          dir="ltr"
          onChange={(e) => handleUpdate({ href: e.target.value })}
          placeholder={hasChildren ? '(Optional for group)' : '/guides'}
          value={item.href ?? ''}
        />

        {/* External Link Toggle */}
        <Button
          aria-label={item.external ? 'External link enabled' : 'External link disabled'}
          className={cn(
            'size-7 shrink-0 text-xs',
            item.external ? 'border border-primary/30 bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => handleUpdate({ external: !item.external })}
          size="icon-xs"
          title="Open in new window (external)"
          type="button"
          variant="ghost"
        >
          <ExternalLink className="size-3.5" />
        </Button>

        {/* Actions: Add sub-tab, move up/down, remove */}
        <div className="flex items-center gap-0.5 border-border/50 border-s ps-1.5">
          <Button
            aria-label="Add sub-tab"
            className="h-7 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={handleAddChild}
            size="sm"
            title="Add sub-tab"
            type="button"
            variant="ghost"
          >
            <CornerDownRight className="me-1 size-3" />
            <span>Sub-tab</span>
          </Button>

          <Button
            aria-label="Move up"
            className="size-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
            disabled={isFirst}
            onClick={() => handleMove('up')}
            size="icon-xs"
            title="Move up"
            type="button"
            variant="ghost"
          >
            <ChevronUp className="size-3.5" />
          </Button>

          <Button
            aria-label="Move down"
            className="size-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
            disabled={isLast}
            onClick={() => handleMove('down')}
            size="icon-xs"
            title="Move down"
            type="button"
            variant="ghost"
          >
            <ChevronDown className="size-3.5" />
          </Button>

          <Button
            aria-label={t('settings.navbar.tabs.remove')}
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={handleRemove}
            size="icon-xs"
            title="Remove tab"
            type="button"
            variant="ghost"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Recursive Children rendering */}
      {hasChildren && expanded && (
        <div className="mt-1.5 ms-4 space-y-1.5 border-border/60 border-s ps-3">
          {item.items?.map((child, index) => (
            <TabTreeNodeItem
              depth={depth + 1}
              direction={direction}
              isFirst={index === 0}
              isLast={index === (item.items?.length ?? 1) - 1}
              item={child}
              key={`${path.join('-')}-${child.href || child.label || index}`}
              onChange={onChange}
              path={[...path, index]}
              tree={tree}
            />
          ))}
        </div>
      )}
    </div>
  );
}
