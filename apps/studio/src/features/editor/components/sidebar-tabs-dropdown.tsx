import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@cms/design-system/components/ui/dropdown-menu';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import { hasIcon, PageIcon } from '@cms/site';
import type { NavLink, NavLinkChild, NavTabItem } from '@cms/validators';
import { Bookmark, Check, ChevronsUpDown, ExternalLink, Folder, Layers, Settings2 } from 'lucide-react';
import { useMemo } from 'react';

export interface SidebarTabsDropdownProps {
  tabs: NavTabItem[];
  links: NavLink[];
  activeTabHref: string | null;
  onSelectTab: (href: string | null) => void;
  onSelectLink?: (link: NavLink | NavLinkChild) => void;
  onManageNavbar?: () => void;
  disabled?: boolean;
}

const cleanHref = (href?: string) => (href ? href.replace(/^\/+|\/+$/g, '') : '');

/**
 * Dropdown selector placed under the active locale in the editor sidebar.
 * Allows authors to filter the page tree by navigation tab or jump to configured navbar links.
 */
export function SidebarTabsDropdown({
  tabs,
  links,
  activeTabHref,
  onSelectTab,
  onSelectLink,
  onManageNavbar,
  disabled = false,
}: SidebarTabsDropdownProps) {
  const t = useT();

  const activeTab = useMemo(() => {
    if (!activeTabHref) return null;
    const cleanActive = cleanHref(activeTabHref);

    const findTab = (items: NavTabItem[]): NavTabItem | null => {
      for (const item of items) {
        if (cleanHref(item.href) === cleanActive) {
          return item;
        }
        if (item.items && item.items.length > 0) {
          const match = findTab(item.items);
          if (match) return match;
        }
      }
      return null;
    };

    return findTab(tabs);
  }, [tabs, activeTabHref]);

  const hasTabs = tabs.length > 0;
  const hasLinks = links.length > 0;

  return (
    <div className="flex items-center gap-1.5 border-border border-b bg-muted/10 px-2.5 py-1.5" data-testid="sidebar-tabs-dropdown">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background/80 px-2 py-1 text-start text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          aria-label={activeTab ? `Active section: ${activeTab.label}` : 'All pages'}
          disabled={disabled}
        >
          {activeTab ? <Folder className="size-3.5 shrink-0 text-primary" /> : <Layers className="size-3.5 shrink-0 text-muted-foreground" />}

          <span className="truncate">{activeTab ? activeTab.label : t('editor.pages')}</span>

          {activeTab?.href && <span className="hidden truncate text-[10px] font-mono text-muted-foreground/80 sm:inline">{activeTab.href}</span>}

          <ChevronsUpDown className="ms-auto size-3 shrink-0 text-muted-foreground/70" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
          {/* All pages option */}
          <DropdownMenuItem onClick={() => onSelectTab(null)} className="flex cursor-pointer items-center justify-between text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <Layers className="size-3.5 shrink-0 text-muted-foreground" />
              <span className={cn('truncate', !activeTabHref ? 'font-semibold text-primary' : 'font-medium')}>{t('editor.pages')}</span>
            </div>
            {!activeTabHref && <Check className="size-3.5 shrink-0 text-primary" />}
          </DropdownMenuItem>

          {/* Configured Tabs */}
          {hasTabs && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t('settings.navbar.tabs.label') || 'Tabs & Sections'}
              </DropdownMenuLabel>
              {renderTabItems(tabs, activeTabHref, onSelectTab)}
            </>
          )}

          {/* Configured Navbar Links */}
          {hasLinks && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t('settings.navbar.links.label') || 'Navbar Links'}
              </DropdownMenuLabel>
              {renderLinkItems(links, onSelectLink)}
            </>
          )}

          {/* Management shortcut */}
          {onManageNavbar && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onManageNavbar}
                className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Settings2 className="size-3.5 shrink-0" />
                <span>{t('settings.navbar.title') || 'Configure navbar & tabs'}</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function renderTabItems(items: NavTabItem[], activeTabHref: string | null, onSelectTab: (href: string | null) => void, depth = 0): React.ReactNode {
  return items.map((tab) => {
    const isSelected = Boolean(activeTabHref && tab.href && cleanHref(activeTabHref) === cleanHref(tab.href));
    const hasChildren = Boolean(tab.items && tab.items.length > 0);

    return (
      <div key={`${tab.label}-${tab.href ?? 'group'}-${depth}`}>
        <DropdownMenuItem
          className={cn(
            'flex cursor-pointer items-center justify-between gap-2 text-xs py-1.5',
            depth > 0 && 'ms-3 border-s border-border/50 ps-2.5',
          )}
          onClick={() => {
            if (tab.href) {
              onSelectTab(tab.href);
            }
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            {depth > 0 ? (
              <Bookmark className="size-3 shrink-0 text-muted-foreground/70" />
            ) : (
              <Folder className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className={cn('truncate', isSelected ? 'font-semibold text-primary' : 'font-medium')}>{tab.label}</span>
            {tab.href && <span className="truncate text-[10px] font-mono text-muted-foreground/70">{tab.href}</span>}
          </div>
          {isSelected && <Check className="size-3.5 shrink-0 text-primary" />}
        </DropdownMenuItem>
        {hasChildren && renderTabItems(tab.items!, activeTabHref, onSelectTab, depth + 1)}
      </div>
    );
  });
}

function renderLinkItems(links: NavLink[], onSelectLink?: (link: NavLink | NavLinkChild) => void): React.ReactNode {
  return links.map((link) => {
    const hasChildren = Boolean(link.items && link.items.length > 0);

    return (
      <div key={`${link.label}-${link.href ?? 'group'}`}>
        <DropdownMenuItem className="flex cursor-pointer items-center justify-between gap-2 text-xs py-1.5" onClick={() => onSelectLink?.(link)}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{link.label}</span>
            {link.href && <span className="truncate text-[10px] font-mono text-muted-foreground/70">{link.href}</span>}
          </div>
          {link.external && <ExternalLink className="size-3 shrink-0 text-muted-foreground/60" />}
        </DropdownMenuItem>

        {hasChildren && (
          <div className="ms-3 space-y-0.5 border-s border-border/50 ps-2.5">
            {link.items!.map((child) => (
              <DropdownMenuItem
                key={`${child.label}-${child.href}`}
                className="flex cursor-pointer items-center justify-between gap-2 text-xs py-1"
                onClick={() => onSelectLink?.(child)}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {child.icon && hasIcon(child.icon) && <PageIcon name={child.icon} className="size-3 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{child.label}</span>
                </div>
                {child.external && <ExternalLink className="size-3 shrink-0 text-muted-foreground/60" />}
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </div>
    );
  });
}
