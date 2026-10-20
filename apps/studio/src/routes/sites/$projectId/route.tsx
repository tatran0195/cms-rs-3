import { SiteApiProvider, SiteLayout, type SiteShell, siteHead } from '@cms/site';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { cmsClient, QueryProvider, queryClient } from '@/shared';

export const Route = createFileRoute('/sites/$projectId')({
  component: SiteRoute,
  notFoundComponent: SiteNotFoundComponent,
  // The active language lives in the URL so it survives reloads and is shareable.
  validateSearch: (search) => z.object({ lang: z.string().min(1).optional().catch(undefined) }).parse(search),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  shouldReload: () => true,
  loader: async ({ params, deps, location }) => {
    try {
      const rest = location.pathname.replace(new RegExp(`^/sites/${params.projectId}/?`), '').replace(/\/+$/, '');
      const rawCandidate = rest && rest !== 'changelog' ? decodeURIComponent(rest).split('/')[0] : undefined;

      // Check if any cached query for this project already knows the valid version slugs
      const cached = queryClient.getQueriesData<SiteShell>({ queryKey: ['site', params.projectId] });
      const knownVersions = cached.find(([, data]) => Boolean(data?.versions))?.[1]?.versions;
      const isKnownVersion = knownVersions && rawCandidate ? knownVersions.some((v) => v.slug === rawCandidate || v.id === rawCandidate) : undefined;

      const candidate = isKnownVersion === false ? undefined : rawCandidate;

      const site = await queryClient.query({
        queryKey: ['site', params.projectId, { language: deps.lang, version: candidate }],
        queryFn: async () => {
          const res = await cmsClient.sites.getSite<SiteShell>(params.projectId, {
            language: deps.lang,
            version: candidate,
          });
          if (candidate && !res.versions.some((v) => v.slug === candidate || v.id === candidate)) {
            queryClient.setQueryData(['site', params.projectId, { language: deps.lang, version: undefined }], res);
          }
          return res;
        },
        staleTime: 'static',
      });
      return { site };
    } catch {
      return { site: null };
    }
  },
  head: ({ loaderData }) => siteHead(loaderData?.site ?? null),
});

function SiteRoute() {
  const { projectId } = Route.useParams();
  const { lang } = Route.useSearch();
  const { site } = Route.useLoaderData();

  return (
    <QueryProvider>
      <SiteApiProvider
        config={{
          search: (options) =>
            cmsClient.sites.search(options.projectId, options.query, {
              language: options.language,
              version: options.version,
              limit: options.limit,
            }),
        }}
      >
        <SiteLayout site={site} projectId={projectId} lang={lang} basePath={`/sites/${projectId}`} />
      </SiteApiProvider>
    </QueryProvider>
  );
}

function SiteNotFoundComponent() {
  const { projectId } = Route.useParams();
  const { lang } = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const site = loaderData?.site ?? null;

  return (
    <QueryProvider>
      <SiteApiProvider
        config={{
          search: (options) =>
            cmsClient.sites.search(options.projectId, options.query, {
              language: options.language,
              version: options.version,
              limit: options.limit,
            }),
        }}
      >
        <SiteLayout site={site} projectId={projectId} lang={lang} basePath={`/sites/${projectId}`}>
          <div className="mx-auto max-w-2xl py-16 text-center">
            <h1 className="font-semibold text-2xl tracking-tight">Page Not Found</h1>
            <p className="mt-2 text-muted-foreground text-sm">The documentation page you requested does not exist.</p>
          </div>
        </SiteLayout>
      </SiteApiProvider>
    </QueryProvider>
  );
}
