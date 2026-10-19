import type {
  DocsLayoutId,
  ThemeColorTokens,
  ThemeComponents,
  ThemeLayout,
  ThemePresetId,
} from '@cms/shared/themes';

export interface FumadocsLayoutOptions {
  nav: {
    title: string;
    transparentMode?: 'none' | 'top' | 'always';
  };
  themeSwitch: {
    enabled: boolean;
    mode?: 'light-dark' | 'light-dark-system';
  };
  searchToggle: {
    enabled: boolean;
  };
  sidebar: {
    collapsible: boolean;
  };
}

export const DEFAULT_FUMADOCS_LAYOUT_OPTIONS: FumadocsLayoutOptions = {
  nav: {
    title: 'My Docs',
    transparentMode: 'none',
  },
  themeSwitch: {
    enabled: true,
    mode: 'light-dark',
  },
  searchToggle: {
    enabled: true,
  },
  sidebar: {
    collapsible: true,
  },
};

export type PropsTablePathCategory =
  | 'nav'
  | 'themeSwitch'
  | 'searchToggle'
  | 'sidebar'
  | 'palette'
  | 'layout'
  | 'components';

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
