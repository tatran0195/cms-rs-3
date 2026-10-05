import { changelogFeedUrl, SiteChangelogView, sitePageUrl } from '@cms/site';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { type ChangelogEntry, siteService } from '@/shared';

export const Route = createFileRoute('/sites/$projectId/changelog')({
  component: SiteChangelog,
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  // Fetch the site shell server-side so the changelog gets a real SSR <title>
  // and canonical (the changelog route renders no SitePageView to own the head).
  loader: async ({ params, deps }) => {
    try {
      const site = await siteService.getSite(params.projectId, { language: deps.lang });
      let entries: ChangelogEntry[] = [];
      try {
        entries = await siteService.listChangelog(params.projectId);
      } catch {
        // The shell still owns SEO/chrome when the optional feed is unavailable.
      }
      return {
        site,
        entries,
        lang: deps.lang,
      };
    } catch {
      return {
        site: null,
        entries: [] as ChangelogEntry[],
        lang: deps.lang,
      };
    }
  },
  head: ({ loaderData, params }) => {
    const site = loaderData?.site ?? null;
    const config = (site?.project.config ?? null) as {
      seo?: { metaTitle?: string; metaDescription?: string };
    } | null;
    // Same cascade as pageHead: language SEO › project SEO › the language's
    // localized site name/description › project name/description.
    const langCfg = site?.languageConfig ?? null;
    const name = langCfg?.seo?.metaTitle || config?.seo?.metaTitle || langCfg?.name || site?.project.name || 'Documentation';
    const description =
      langCfg?.seo?.metaDescription ||
      config?.seo?.metaDescription ||
      langCfg?.description ||
      site?.project.description ||
      `Every update shipped to ${name}.`;
    // Canonicalize to the site's one base (primary domain › subdomain › self).
    const project = site?.project;
    const url = sitePageUrl(params.projectId, 'changelog', loaderData?.lang, {
      primaryDomain: project?.primaryDomain,
      slug: project?.slug,
    });
    return {
      meta: [{ title: `Changelog — ${name}` }, { name: 'description', content: description }],
      links: [
        { rel: 'canonical', href: url },
        {
          rel: 'alternate',
          type: 'application/rss+xml',
          title: `${name} changelog`,
          href: changelogFeedUrl(url),
        },
      ],
    };
  },
});

function SiteChangelog() {
  const { lang } = useSearch({ strict: false }) as { lang?: string };
  const { entries } = Route.useLoaderData();

  return <SiteChangelogView entries={entries} lang={lang} />;
}
