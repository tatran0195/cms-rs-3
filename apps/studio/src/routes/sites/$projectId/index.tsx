import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { pageHead, redirectIfConfigured, SitePageView } from '@cms/site';
import { ApiResponseError, siteService } from '@/shared';

export const Route = createFileRoute('/sites/$projectId/')({
  component: SiteHome,
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  // Empty path resolves to the site's first page server-side (content + SEO).
  loader: async ({ params, deps }) => {
    try {
      const page = await siteService.getPage(params.projectId, '', { language: deps.lang });
      return { page, lang: deps.lang };
    } catch (error) {
      if (!(error instanceof ApiResponseError) || error.status !== 404) {
        throw error;
      }
      // A site may intentionally publish only an API reference. Give that
      // reference a useful home URL instead of returning a root 404.
      const site = await siteService.getSite(params.projectId, { language: deps.lang }).catch(() => null);
      if (site?.openapi) {
        const prefix = `/sites/${params.projectId}`;
        const query = deps.lang ? `?lang=${encodeURIComponent(deps.lang)}` : '';
        throw redirect({ href: `${prefix}/${site.openapi.path}${query}`, statusCode: 302 });
      }
      // Honor a configured redirect for the site root before the not-found
      // state. Mark the SSR response 404 so this soft-404 returns the right
      // status (the head also carries robots noindex).
      await redirectIfConfigured(params.projectId, '', deps.lang, undefined, `/sites/${params.projectId}`);
      // Throw the router's not-found sentinel so TanStack owns the final HTTP
      // status. Mutating the response from inside this streamed loader produced
      // a soft 200 in production.
      throw notFound();
    }
  },
  head: ({ loaderData, params }) => pageHead(loaderData?.page ?? null, params.projectId, loaderData?.lang),
});

function SiteHome() {
  const { projectId } = Route.useParams();
  // Active language comes from the parent route's ?lang= search param.
  const { lang } = Route.useSearch();
  const { page } = Route.useLoaderData();
  // Empty path resolves to the first page server-side.
  return <SitePageView projectId={projectId} lang={lang} data={page} />;
}
