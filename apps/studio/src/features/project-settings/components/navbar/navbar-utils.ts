import type { NavTabItem } from '@cms/validators';
import type { AnchorRow, NavRow } from './types';

export const cleanRows = (rows: NavRow[]): Array<{ label: string; href: string; external?: boolean }> =>
  rows
    .filter((row) => row.label.trim() || row.href.trim())
    .map((row) => ({
      label: row.label,
      href: row.href,
      external: row.external,
    }));

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
