/**
 * Compiled MDX article bodies, keyed by slug. Kept separate from lib/blog.ts
 * (the frontmatter registry) so only the /blog/$slug route bundles the prose —
 * metadata consumers (landing teaser, blog index, sitemap) stay light.
 */
import type { ComponentType } from 'react';
import type { MdxComponent } from '@/components/marketing/blog';

const MDX_EXTENSION_RE = /\.mdx$/;

const componentModules = import.meta.glob<{ default: ComponentType<{ components?: Record<string, MdxComponent> }> }>('../content/blog/*.mdx', {
  eager: true,
});

const componentsBySlug = new Map(
  Object.entries(componentModules).map(([file, mod]) => [file.split('/').pop()?.replace(MDX_EXTENSION_RE, '') ?? file, mod.default]),
);

export const blogComponent = (slug: string) => componentsBySlug.get(slug);
