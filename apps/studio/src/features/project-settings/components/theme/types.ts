export type PropsTablePathCategory = 'layout' | 'header' | 'sidebar' | 'themeSwitch' | 'toc' | 'palette' | 'components';

export type PropsTablePath = [] | [PropsTablePathCategory];

export interface ThemePropertyItem {
  id: PropsTablePathCategory;
  name: string;
  summary: string;
  type: string;
}

export function formatPropSummary(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined);
    if (keys.length === 0) return '{}';
    return `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''} }`;
  }
  return String(value ?? '');
}
