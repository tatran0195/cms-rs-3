import { cn } from '@cms/design-system/lib/utils';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useSidebar } from '../context/sidebar-context';

export function SidebarToggle({ className }: { className?: string }) {
  const { collapsed, toggleCollapsed, collapsible } = useSidebar();
  if (!collapsible) return null;

  return (
    <button
      type="button"
      onClick={toggleCollapsed}
      data-sidebar-toggle="true"
      aria-label={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
      title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
      className={cn(
        'grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
    </button>
  );
}
