import type { NavTabItem } from '@cms/validators';

export interface NavRow {
  label: string;
  href: string;
  external?: boolean;
}

export interface AnchorRow extends NavRow {
  icon?: string;
}

/** Prevent TanStack Form DeepKeys infinite recursion by breaking the cycle in the form state type: */
export type FormNavTabItem = Omit<NavTabItem, 'items'> & {
  items?: unknown[];
};

/** The editable navbar values shared by project scope and language scopes */
export interface NavbarValues {
  ctaLabel: string;
  ctaUrl: string;
  links: NavRow[];
  tabs: FormNavTabItem[];
  anchors: AnchorRow[];
}

// biome-ignore lint/suspicious/noExplicitAny: Tanstack Form React hook instance
export type NavbarFormApi = any;

export interface GlobalNavbarPreview {
  ctaUrl: string;
  showSearch: boolean;
  changelog: boolean;
}
