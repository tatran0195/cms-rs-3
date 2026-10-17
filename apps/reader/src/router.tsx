import {
  type ChangelogEntry,
  firstLeafPath,
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
import { createRootRouteWithContext, createRoute, createRouter, notFound, Outlet, redirect } from '@tanstack/react-router';
import { z } from 'zod';

export interface RouterContext {
  queryClient: QueryClient;
  bootstrapSite?: SiteShell | null;
}

function parseVersionAndLang(rawPath: string) {
  const clean = rawPath.replace(/^sites\/[^/]+\/?/, '').replace(/^\/+|\/+$/g, '');
  const parts = clean ? decodeURIComponent(clean).split('/').filter(Boolean) : [];
  let version: string | undefined;
  let lang: string | undefined;
  let startIndex = 0;

  const firstPart = parts[0];
  if (firstPart && /^v\d+(\.\d+)*$/i.test(firstPart)) {
    version = firstPart;
    startIndex = 1;
  }

  const langPart = parts[startIndex];
  if (langPart && /^[a-z]{2}(-[A-Z]{2})?$/i.test(langPart)) {
    lang = langPart.toLowerCase();
  }

  return { cleanPath: clean, version, lang };
}

// ── Root Route ─────────────────────────────────────────────────────────────
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  validateSearch: (search) => z.object({ lang: z.string().min(1).optional().catch(undefined) }).parse(search),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ context, deps, location }) => {
    const { version, lang } = parseVersionAndLang(location.pathname);
    const effectiveLang = deps.lang || lang;

    if (context.bootstrapSite && (!version || context.bootstrapSite.activeVersion === version)) {
      return { site: context.bootstrapSite };
    }
    try {
      const params = new URLSearchParams();
      if (effectiveLang) params.set('lang', effectiveLang);
      if (version) params.set('version', version);
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/v1/bootstrap${query}`);
      if (!res.ok) {
        const fallbackRes = await fetch(`/api/v1/bootstrap${effectiveLang ? `?lang=${encodeURIComponent(effectiveLang)}` : ''}`);
        if (!fallbackRes.ok) return { site: null };
        const fallbackSite: SiteShell = await fallbackRes.json();
        return { site: fallbackSite };
      }
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
  loader: async ({ context, deps }) => {
    try {
      const res = await fetch(`/api/v1/page?path=${deps.lang ? `&lang=${encodeURIComponent(deps.lang)}` : ''}`);
      if (res.ok) {
        const page: SitePage = await res.json();
        return { page, lang: deps.lang };
      }
    } catch {
      // ignore
    }

    let site = context.bootstrapSite;
    if (!site) {
      try {
        const res = await fetch(`/api/v1/bootstrap${deps.lang ? `?lang=${encodeURIComponent(deps.lang)}` : ''}`);
        if (res.ok) {
          site = await res.json();
        }
      } catch {
        // ignore
      }
    }

    const target = site?.nav ? firstLeafPath(site.nav) : undefined;
    if (target) {
      const { lang } = parseVersionAndLang(target);
      const effectiveLang = deps.lang || lang;
      const query = effectiveLang ? `?lang=${encodeURIComponent(effectiveLang)}` : '';
      const href = target.startsWith('/') ? `${target}${query}` : `/${target}${query}`;
      throw redirect({ href, statusCode: 302 });
    }

    throw notFound();
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
    const rawPath = (params._splat ?? '').replace(/^sites\/[^/]+\/?/, '').replace(/^\/+/, '');
    const { version, lang } = parseVersionAndLang(rawPath);
    const effectiveLang = deps.lang || lang;

    const fetchPage = async (p: string, v?: string, l?: string) => {
      const q = new URLSearchParams({ path: p.startsWith('/') ? p : `/${p}` });
      if (l) q.set('lang', l);
      if (v) q.set('version', v);
      return fetch(`/api/v1/page?${q.toString()}`);
    };

    try {
      let res = await fetchPage(rawPath, version, effectiveLang);

      if (!res.ok && version) {
        const stripped = rawPath.replace(new RegExp(`^${version}/?`, 'i'), '');
        res = await fetchPage(stripped, version, effectiveLang);
      }

      if (!res.ok && effectiveLang) {
        res = await fetchPage(rawPath, version, undefined);
      }

      if (!res.ok) {
        res = await fetchPage(rawPath);
      }

      if (!res.ok) {
        try {
          const bootQuery = version
            ? `?version=${encodeURIComponent(version)}${effectiveLang ? `&lang=${encodeURIComponent(effectiveLang)}` : ''}`
            : effectiveLang
              ? `?lang=${encodeURIComponent(effectiveLang)}`
              : '';
          let bootRes = await fetch(`/api/v1/bootstrap${bootQuery}`);
          let effectiveVersion = version;
          if (!bootRes.ok && version) {
            bootRes = await fetch(`/api/v1/bootstrap${effectiveLang ? `?lang=${encodeURIComponent(effectiveLang)}` : ''}`);
            effectiveVersion = undefined;
          }
          if (bootRes.ok) {
            const bSite: SiteShell = await bootRes.json();
            const firstLeaf = bSite.nav ? firstLeafPath(bSite.nav) : undefined;
            if (firstLeaf) {
              const { lang: leafLang } = parseVersionAndLang(firstLeaf);
              const targetLang = effectiveLang || leafLang;
              const prefix = effectiveVersion && bSite.versions.some((v) => v.slug === effectiveVersion && !v.isDefault) ? `/${effectiveVersion}` : '';
              const targetHref = `${prefix}${firstLeaf.startsWith('/') ? firstLeaf : `/${firstLeaf}`}${targetLang ? `?lang=${encodeURIComponent(targetLang)}` : ''}`;
              throw redirect({ href: targetHref, statusCode: 302 });
            }
          }
        } catch (e) {
          if (e && typeof e === 'object' && 'statusCode' in e) throw e;
        }
        throw notFound();
      }

      const data = await res.json();
      return { data, path: rawPath, lang: effectiveLang };
    } catch (e) {
      if (e && typeof e === 'object' && 'statusCode' in e) throw e;
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
    if (!data) return null;
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
