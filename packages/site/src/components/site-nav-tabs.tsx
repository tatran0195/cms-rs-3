import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@cms/design-system/components/ui/navigation-menu';
import { cn } from '@cms/design-system/lib/utils';
import type { SnapshotNavTabItem } from '@cms/shared';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { siteHref } from '../lib/site-paths';

export interface SiteNavTabsProps {
  tabs: SnapshotNavTabItem[];
  currentPath?: string;
  projectId?: string;
  lang?: string;
  version?: string;
  basePath?: string;
  className?: string;
}

const isNavActive = (href?: string, currentPath = ''): boolean => {
  if (!href?.startsWith('/') || href.startsWith('//')) return false;
  const prefix = href.replace(/^\/+|\/+$/g, '');
  const normCurrent = currentPath.replace(/^\/+|\/+$/g, '');
  return prefix !== '' && (normCurrent === prefix || normCurrent.startsWith(`${prefix}/`));
};

const hasActiveDescendant = (item: SnapshotNavTabItem, currentPath = ''): boolean =>
  (Boolean(item.href) && isNavActive(item.href, currentPath)) || (item.items?.some((child) => hasActiveDescendant(child, currentPath)) ?? false);

interface CascadingSubmenuItemProps {
  item: SnapshotNavTabItem;
  resolveNavHref: (href?: string) => string;
  currentPath: string;
  depth?: number;
}

function CascadingSubmenuItem({ item, resolveNavHref, currentPath, depth = 1 }: CascadingSubmenuItemProps) {
  const [open, setOpen] = useState(false);
  const hasChildren = Boolean(item.items && item.items.length > 0);
  const isActive = isNavActive(item.href, currentPath);
  const activeDescendant = hasChildren && hasActiveDescendant(item, currentPath);

  if (!hasChildren) {
    return (
      <NavigationMenuLink
        className={cn(
          'flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors',
          isActive ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
        )}
        data-active={isActive ? 'true' : undefined}
        href={resolveNavHref(item.href)}
        rel={item.external ? 'noopener noreferrer' : undefined}
        target={item.external ? '_blank' : undefined}
      >
        <span>{item.label}</span>
      </NavigationMenuLink>
    );
  }

  return (
    <div
      className="relative group/cascading"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <div
        className={cn(
          'flex cursor-pointer select-none items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors',
          isActive || activeDescendant ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
        )}
      >
        {item.href ? (
          <a
            href={resolveNavHref(item.href)}
            className="flex-1 truncate hover:underline"
            target={item.external ? '_blank' : undefined}
            rel={item.external ? 'noopener noreferrer' : undefined}
          >
            {item.label}
          </a>
        ) : (
          <span className="flex-1 truncate">{item.label}</span>
        )}
        <ChevronRight className="ms-1 size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover/cascading:translate-x-0.5 rtl:rotate-180" />
      </div>

      {open && (
        <div
          className={cn(
            'absolute top-0 start-full z-50 ms-1 min-w-[190px] rounded-lg border border-border/80 bg-popover p-1 text-popover-foreground shadow-lg backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-150',
          )}
        >
          <div className="flex flex-col gap-0.5">
            {item.items?.map((child, idx) => (
              <CascadingSubmenuItem currentPath={currentPath} depth={depth + 1} item={child} key={idx} resolveNavHref={resolveNavHref} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SiteNavTabs({ tabs, currentPath = '', projectId, lang, version, basePath, className }: SiteNavTabsProps) {
  if (!tabs || tabs.length === 0) return null;

  const resolveNavHref = (href?: string): string => {
    if (!href) return '#';
    if (!projectId) return href;
    return href.startsWith('/') && !href.startsWith('//') ? siteHref(projectId, href, { lang, version, basePath }) : href;
  };

  return (
    <nav aria-label="Navigation Tabs" className={cn('w-full', className)}>
      <NavigationMenu className="max-w-full justify-start">
        <NavigationMenuList className="flex-wrap justify-start gap-1">
          {tabs.map((tab, idx) => {
            const hasChildren = Boolean(tab.items && tab.items.length > 0);
            const active = isNavActive(tab.href, currentPath);
            const activeDescendant = hasChildren && hasActiveDescendant(tab, currentPath);

            if (!hasChildren) {
              return (
                <NavigationMenuItem className="list-none" key={idx}>
                  <NavigationMenuLink
                    className={cn(
                      'rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
                      active ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                    data-active={active ? 'true' : undefined}
                    href={resolveNavHref(tab.href)}
                    rel={tab.external ? 'noopener noreferrer' : undefined}
                    target={tab.external ? '_blank' : undefined}
                  >
                    {tab.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              );
            }

            return (
              <NavigationMenuItem className="list-none" key={idx}>
                <NavigationMenuTrigger
                  className={cn(
                    'h-auto rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
                    active || activeDescendant
                      ? 'bg-primary/10 font-semibold text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {tab.label}
                </NavigationMenuTrigger>
                <NavigationMenuContent className="min-w-[200px] p-1">
                  <div className="flex flex-col gap-0.5">
                    {tab.items?.map((child, childIdx) => (
                      <CascadingSubmenuItem currentPath={currentPath} item={child} key={childIdx} resolveNavHref={resolveNavHref} />
                    ))}
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
            );
          })}
        </NavigationMenuList>
      </NavigationMenu>
    </nav>
  );
}
