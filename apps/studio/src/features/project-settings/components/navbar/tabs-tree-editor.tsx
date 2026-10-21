import { Button } from '@cms/design-system/components/ui/button';
import { useT } from '@cms/i18n/react';
import type { NavTabItem } from '@cms/validators';
import { Plus } from 'lucide-react';
import { TabTreeNodeItem } from './tab-tree-node-item';

export function TabsTreeEditor({
  value,
  onChange,
  direction,
}: {
  value: NavTabItem[];
  onChange: (next: NavTabItem[]) => void;
  direction?: 'ltr' | 'rtl';
}) {
  const t = useT();

  const handleAddRoot = () => {
    onChange([...value, { label: '', href: '' }]);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="space-y-2 overflow-hidden rounded-xl border border-border/80 bg-muted/20 p-2.5">
          {value.map((item, index) => (
            <TabTreeNodeItem
              depth={0}
              direction={direction}
              isFirst={index === 0}
              isLast={index === value.length - 1}
              item={item}
              key={`root-${item.href || item.label || index}`}
              onChange={onChange}
              path={[index]}
              tree={value}
            />
          ))}
        </div>
      ) : null}
      <Button className="mb-1.5 border-dashed text-muted-foreground" onClick={handleAddRoot} type="button" variant="outline">
        <Plus className="size-3.5" /> {t('settings.navbar.tabs.add')}
      </Button>
    </div>
  );
}
