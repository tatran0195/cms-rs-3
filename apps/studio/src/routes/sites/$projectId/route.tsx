import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { QueryProvider, siteService } from '@/shared';
import { siteHead, SiteApiProvider, SiteLayout } from '@cms/site';

export const Route = createFileRoute('/sites/$projectId')({
  component: SiteRoute,
  // The active language lives in the URL so it survives reloads and is shareable.
  validateSearch: (search) => z.object({ lang: z.string().min(1).optional().catch(undefined) }).parse(search),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ params, deps, location }) => {
    try {
      const rest = location.pathname.replace(new RegExp(`^/sites/${params.projectId}/?`), '').replace(/\/+$/, '');
      const candidate = rest && rest !== 'changelog' ? decodeURIComponent(rest).split('/')[0] : undefined;
      const site = await siteService.getSite(params.projectId, {
        language: deps.lang,
        version: candidate,
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
            siteService.search(options.projectId, options.query, {
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
