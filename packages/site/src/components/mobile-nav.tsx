import { ScrollArea } from '@cms/design-system/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@cms/design-system/components/ui/sheet';
import { cn } from '@cms/design-system/lib/utils';
import type { SnapshotNavTabItem } from '@cms/shared';
import { ChevronDown, ChevronRight, ExternalLink, Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { siteHref } from '../lib/site-paths';
import type { NavNode } from '../types';
import { SiteNav } from './site-nav';

export interface MobileNavLink {
  label: string;
  href?: string;
  active: boolean;
  external: boolean;
  items?: Array<{
    label: string;
    href: string;
    active: boolean;
    external: boolean;
    icon?: string;
    description?: string;
  }>;
}

function MobileTabTreeItem({
  item,
  projectId,
  currentPath,
  lang,
  version,
  basePath,
  depth = 0,
}: {
  item: SnapshotNavTabItem;
  projectId: string;
  currentPath: string;
  lang?: string;
  version?: string;
  basePath?: string;
  depth?: number;
}) {
  const hasChildren = Boolean(item.items && item.items.length > 0);
  const isNavActive = (href?: string): boolean => {
    if (!href?.startsWith('/') || href.startsWith('//')) return false;
    const prefix = href.replace(/^\/+|\/+$/g, '');
    const norm = currentPath.replace(/^\/+|\/+$/g, '');
    return prefix !== '' && (norm === prefix || norm.startsWith(`${prefix}/`));
  };
  const active = isNavActive(item.href);
  const [open, setOpen] = useState(active);

  const resolveHref = (href?: string): string => {
    if (!href) return '#';
    return href.startsWith('/') && !href.startsWith('//') ? siteHref(projectId, href, { lang, version, basePath }) : href;
  };

  return (
    <li>
      <div
        className={cn(
          'flex items-center justify-between rounded-lg px-2 py-1.5 font-medium text-sm transition-colors',
          active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {item.href ? (
          <a
            aria-current={active ? 'page' : undefined}
            className="flex-1 truncate"
            href={resolveHref(item.href)}
            rel={item.external ? 'noreferrer' : undefined}
            target={item.external ? '_blank' : undefined}
          >
            {item.label}
          </a>
        ) : (
          <button
            type="button"
            className="flex-1 cursor-pointer truncate text-left bg-transparent border-0 p-0 font-normal text-sm text-foreground"
            onClick={() => hasChildren && setOpen(!open)}
          >
            {item.label}
          </button>
        )}

        {hasChildren && (
          <button
            aria-label={open ? 'Collapse section' : 'Expand section'}
            className="p-1 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(!open)}
            type="button"
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        )}
      </div>

      {hasChildren && open && (
        <ul className="ms-3 space-y-0.5 border-border/50 border-s ps-2 pt-0.5">
          {item.items?.map((child, idx) => (
            <MobileTabTreeItem
              basePath={basePath}
              currentPath={currentPath}
              depth={depth + 1}
              item={child}
              key={child.href || `${child.label}-${idx}`}
              lang={lang}
              projectId={projectId}
              version={version}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Mobile accordion for a navbar link that has dropdown children.
 */
function MobileDropdownLink({ link }: { link: MobileNavLink }) {
  const hasActiveChild = link.items?.some((c) => c.active) ?? false;
  const [open, setOpen] = useState(hasActiveChild);

  return (
    <li>
      <div
        className={cn(
          'flex items-center justify-between rounded-lg px-2 py-1.5 font-medium text-sm transition-colors',
          hasActiveChild ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {link.href ? (
          <a href={link.href} className="flex-1 truncate hover:text-foreground">
            {link.label}
          </a>
        ) : (
          <button
            type="button"
            className="flex-1 cursor-pointer truncate text-left bg-transparent border-0 p-0 font-medium text-sm"
            onClick={() => setOpen(!open)}
          >
            {link.label}
          </button>
        )}
        <button
          aria-label={open ? 'Collapse section' : 'Expand section'}
          className="p-1 text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(!open)}
          type="button"
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
      </div>
      {open && (
        <ul className="ms-3 space-y-0.5 border-border/50 border-s ps-2 pt-0.5">
          {link.items?.map((child) => (
            <li key={`${child.label}-${child.href}`}>
              <a
                href={child.href}
                target={child.external ? '_blank' : undefined}
                rel={child.external ? 'noreferrer' : undefined}
                aria-current={child.active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                  child.active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {child.label}
                {child.external && <ExternalLink className="size-3 shrink-0" />}
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Hamburger + slide-in drawer that exposes the full page tree below `lg`, where
 * the desktop sidebar is hidden. Without it, multi-page sites are unnavigable on
 * phones (only search + the prev/next pager survive). The header's section links
 * (Docs/Changelog/custom) are mirrored at the top since they're hidden below `lg`.
 */
export function MobileNav({
  nodes,
  projectId,
  currentPath,
  lang,
  version,
  label,
  isRtl,
  links = [],
  tabs = [],
  basePath,
}: {
  nodes: NavNode[];
  projectId: string;
  currentPath: string;
  lang?: string;
  version?: string;
  label: string;
  isRtl?: boolean;
  links?: MobileNavLink[];
  tabs?: SnapshotNavTabItem[];
  basePath?: string;
}) {
  const [open, setOpen] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer when the route (currentPath) changes.
  useEffect(() => {
    setOpen(false);
  }, [currentPath]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={label}
        className="-ms-1 inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="size-5" />
      </SheetTrigger>
      {/* Open from the reading-start edge: left in LTR, right in RTL. */}
      <SheetContent side={isRtl ? 'right' : 'left'} className="w-80 p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>{label}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-full">
          <div className="px-4 pt-12 pb-8">
            {links.length > 0 ? (
              <ul className="mb-4 space-y-0.5 border-border/60 border-b pb-4">
                {links.map((link) => {
                  const isDropdown = Boolean(link.items && link.items.length > 0);

                  if (isDropdown) {
                    return <MobileDropdownLink key={link.label} link={link} />;
                  }

                  return (
                    <li key={`${link.label}-${link.href}`}>
                      <a
                        href={link.href}
                        target={link.external ? '_blank' : undefined}
                        rel={link.external ? 'noreferrer' : undefined}
                        aria-current={link.active ? 'page' : undefined}
                        className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-medium text-sm transition-colors ${
                          link.active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {link.label}
                        {link.external ? <ExternalLink className="size-3" /> : null}
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {tabs.length > 0 ? (
              <ul className="mb-4 space-y-0.5 border-border/60 border-b pb-4">
                {tabs.map((tab, idx) => (
                  <MobileTabTreeItem
                    basePath={basePath}
                    currentPath={currentPath}
                    item={tab}
                    key={tab.href || `${tab.label}-${idx}`}
                    lang={lang}
                    projectId={projectId}
                    version={version}
                  />
                ))}
              </ul>
            ) : null}

            <SiteNav nodes={nodes} projectId={projectId} currentPath={currentPath} lang={lang} version={version} />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
