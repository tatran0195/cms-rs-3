import type { NavTabItem } from '@cms/validators';
import type { AnchorRow, NavLinkChild, NavRow } from './types';

export const normalizeLinks = (items?: unknown[]): NavRow[] =>
  (items ?? []).map((link) => {
    const item = typeof link === 'object' && link !== null ? (link as Record<string, unknown>) : {};
    const rawItems = Array.isArray(item.items) ? item.items : [];
    const children: NavLinkChild[] = rawItems.map((child) => {
      const c = typeof child === 'object' && child !== null ? (child as Record<string, unknown>) : {};
      return {
        label: typeof c.label === 'string' ? c.label : '',
        href: typeof c.href === 'string' ? c.href : '',
        external: Boolean(c.external) || undefined,
        icon: typeof c.icon === 'string' ? c.icon : '',
        description: typeof c.description === 'string' ? c.description : '',
      };
    });
    return {
      label: typeof item.label === 'string' ? item.label : '',
      href: typeof item.href === 'string' ? item.href : '',
      external: Boolean(item.external) || undefined,
      items: children.length > 0 ? children : undefined,
    };
  });

export const cleanRows = (
  rows: NavRow[],
): Array<{ label: string; href?: string; external?: boolean; items?: Array<{ label: string; href: string; icon?: string; description?: string; external?: boolean }> }> =>
  rows
    .filter((row) => row.label.trim() || row.href?.trim() || (row.items && row.items.length > 0))
    .map((row) => {
      const cleanItems = (row.items ?? [])
        .filter((child) => child.label.trim() && child.href.trim())
        .map((child) => ({
          label: child.label,
          href: child.href,
          icon: child.icon ? child.icon.trim() || undefined : undefined,
          description: child.description ? child.description.trim() || undefined : undefined,
          external: child.external,
        }));
      return {
        label: row.label,
        href: row.href || undefined,
        external: row.external,
        items: cleanItems.length > 0 ? cleanItems : undefined,
      };
    });

export const cleanAnchorRows = (rows: AnchorRow[]): Array<{ label: string; href: string; icon?: string; external?: boolean }> =>
  rows
    .filter((row) => row.label.trim() || row.href.trim())
    .map((row) => ({
      label: row.label,
      href: row.href,
      icon: row.icon ? row.icon.trim() || undefined : undefined,
      external: row.external,
    }));

export const normalizeTabs = (items?: unknown[]): NavTabItem[] =>
  (items ?? []).map((tab) => {
    const item = typeof tab === 'object' && tab !== null ? (tab as Record<string, unknown>) : {};
    return {
      label: typeof item.label === 'string' ? item.label : '',
      href: typeof item.href === 'string' ? item.href : '',
      external: Boolean(item.external),
      items: Array.isArray(item.items) && item.items.length > 0 ? normalizeTabs(item.items) : undefined,
    };
  });
