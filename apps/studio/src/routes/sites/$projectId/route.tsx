import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { getSiteFn } from '@/functions/site';
import { QueryProvider } from '@/integrations/tanstack-query/root-provider';
import { customDomainOrigin } from '@/lib/site-origin';
import { siteHead } from '@/lib/site-seo';
import { SiteLayout } from '@cms/site';

export const Route = createFileRoute('/sites/$projectId')({
  component: SiteRoute,
  // The active language lives in the URL so it survives reloads and is shareable.
  validateSearch: (search) => z.object({ lang: z.string().min(1).optional().catch(undefined) }).parse(search),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ params, deps, location }) => {
    try {
      const rest = location.pathname.replace(new RegExp(`^/sites/${params.projectId}/?`), '').replace(/\/+$/, '');
      const candidate = rest && rest !== 'changelog' ? decodeURIComponent(rest).split('/')[0] : undefined;
      const site = await getSiteFn({
        data: {
          projectId: params.projectId,
          language: deps.lang,
          version: candidate,
        },
      });
      return { site, siteOrigin: customDomainOrigin() };
    } catch {
      return { site: null, siteOrigin: customDomainOrigin() };
    }
  },
  head: ({ loaderData }) => siteHead(loaderData?.site ?? null, loaderData?.siteOrigin),
});

function SiteRoute() {
  const { projectId } = Route.useParams();
  const { lang } = Route.useSearch();
  const { site } = Route.useLoaderData();

  return (
    <QueryProvider>
      <SiteLayout site={site} projectId={projectId} lang={lang} basePath={`/sites/${projectId}`} />
    </QueryProvider>
  );
}
