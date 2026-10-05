import type { SiteSnapshot } from '@cms/shared/site';
import { createFileRoute } from '@tanstack/react-router';
import { GitPreviewPage } from '@/features/publishing';
import { siteService } from '@/shared';

export const Route = createFileRoute('/git-preview/$token')({
  loader: async ({ params }) =>
    JSON.parse(await siteService.getGitPreview(params.token)) as {
      snapshot: SiteSnapshot;
    },
  head: () => ({
    meta: [{ title: 'Pull request preview · cms' }, { name: 'robots', content: 'noindex,nofollow' }],
  }),
  component: GitPreviewRoute,
});

function GitPreviewRoute() {
  const { snapshot } = Route.useLoaderData();
  return <GitPreviewPage snapshot={snapshot} />;
}
