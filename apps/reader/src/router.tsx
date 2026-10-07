import {
  type ChangelogEntry,
  OpenApiReferenceView,
  pageHead,
  SiteApiProvider,
  SiteChangelogView,
  SiteLayout,
  type SitePage,
  SitePageView,
  type SiteShell,
  siteHead,
} from '@cms/site';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouter, notFound, Outlet } from '@tanstack/react-router';
import { z } from 'zod';

export interface RouterContext {
  queryClient: QueryClient;
  bootstrapSite?: SiteShell | null;
}

// ── Root Route ─────────────────────────────────────────────────────────────
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  validateSearch: (search) => z.object({ lang: z.string().min(1).optional().catch(undefined) }).parse(search),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ context, deps }) => {
    if (context.bootstrapSite) {
      return { site: context.bootstrapSite };
    }
    try {
      const res = await fetch(`/api/v1/bootstrap${deps.lang ? `?lang=${encodeURIComponent(deps.lang)}` : ''}`);
      if (!res.ok) return { site: null };
      const site: SiteShell = await res.json();
      return { site };
    } catch {
      return { site: null };
    }
  },
  head: ({ loaderData }) => siteHead(loaderData?.site ?? null),
});

function RootComponent() {
  const { site } = rootRoute.useLoaderData();
  const { lang } = rootRoute.useSearch();
  return (
    <SiteApiProvider
      config={{
        search: async (options) => {
          const params = new URLSearchParams({ q: options.query });
          if (options.language) params.set('lang', options.language);
          if (options.version) params.set('version', options.version);
          if (options.limit) params.set('limit', String(options.limit));
          const res = await fetch(`/api/v1/search?${params.toString()}`);
          if (!res.ok) throw new Error(`Search failed: ${res.status}`);
          const json = await res.json();
          return json.hits ?? json;
        },
      }}
    >
      <SiteLayout site={site} projectId={site?.project.id ?? 'standalone'} lang={lang} basePath="">
        <Outlet />
      </SiteLayout>
    </SiteApiProvider>
  );
}

// ── Home Route (/) ─────────────────────────────────────────────────────────
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ deps }) => {
    try {
      const res = await fetch(`/api/v1/page?path=${deps.lang ? `&lang=${encodeURIComponent(deps.lang)}` : ''}`);
      if (!res.ok) throw notFound();
      const page: SitePage = await res.json();
      return { page, lang: deps.lang };
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData }) => pageHead(loaderData?.page ?? null, 'standalone', loaderData?.lang),
  component: () => {
    const { page, lang } = indexRoute.useLoaderData();
    return <SitePageView projectId={page?.project?.id ?? 'standalone'} lang={lang} data={page} />;
  },
});

// ── Changelog Route (/changelog) ───────────────────────────────────────────
const changelogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/changelog',
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async () => {
    try {
      const res = await fetch('/api/v1/changelog');
      if (!res.ok) return { entries: [] as ChangelogEntry[] };
      const entries: ChangelogEntry[] = await res.json();
      return { entries };
    } catch {
      return { entries: [] as ChangelogEntry[] };
    }
  },
  component: () => {
    const { entries } = changelogRoute.useLoaderData();
    const { lang } = rootRoute.useSearch();
    return <SiteChangelogView entries={entries} lang={lang} />;
  },
});

// ── Splat Route (/*) ───────────────────────────────────────────────────────
const pageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$',
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ params, deps }) => {
    const path = params._splat ?? '';
    try {
      const res = await fetch(`/api/v1/page?path=${encodeURIComponent(path)}${deps.lang ? `&lang=${encodeURIComponent(deps.lang)}` : ''}`);
      if (!res.ok) throw notFound();
      const data = await res.json();
      return { data, path, lang: deps.lang };
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData }) => {
    if (loaderData?.data?.page) {
      return pageHead(loaderData.data, 'standalone', loaderData?.lang);
    }
    return {};
  },
  component: () => {
    const { data, lang } = pageRoute.useLoaderData();
    if (data?.kind === 'openapi') {
      return <OpenApiReferenceView projectId="standalone" />;
    }
    return <SitePageView projectId={data?.project?.id ?? 'standalone'} lang={lang} data={data} />;
  },
});

export const routeTree = rootRoute.addChildren([indexRoute, changelogRoute, pageRoute]);

export function createSiteRouter(context: RouterContext) {
  return createRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: 'intent',
  });
}
