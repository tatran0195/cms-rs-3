import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { EditorPage } from '@/features/editor';

export const Route = createFileRoute('/app/projects/$projectId/editor')({
  component: EditorRoute,
  // Deep links from the dashboard: `?page=<id>` opens a specific page (e.g. a
  // publish-check issue), `?publish=true` opens the publish flow directly.
  validateSearch: (search) =>
    z
      .object({
        firstPublish: z.preprocess((value) => (value === true || value === 'true' || value === '1' ? true : undefined), z.literal(true).optional()),
        page: z.string().min(1).optional().catch(undefined),
        publish: z.preprocess((value) => (value === true || value === 'true' || value === '1' ? true : undefined), z.literal(true).optional()),
      })
      .parse(search),
});

function EditorRoute() {
  const { projectId } = Route.useParams();
  const { firstPublish, page, publish } = Route.useSearch();
  return <EditorPage projectId={projectId} firstPublish={firstPublish} page={page} publish={publish} />;
}
