import type { NavTabItem } from '@cms/validators';

export interface NavLinkChild {
  label: string;
  href: string;
  external?: boolean;
  icon?: string;
  description?: string;
}

export interface NavRow {
  label: string;
  href?: string;
  external?: boolean;
  items?: NavLinkChild[];
}

export interface AnchorRow extends Omit<NavRow, 'href' | 'items'> {
  href: string;
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
  anchors: AnchorRow[];
}

export type NavbarFormApi = any;

export interface GlobalNavbarPreview {
  ctaUrl: string;
  showSearch: boolean;
  changelog: boolean;
}
