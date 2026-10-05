import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { ProjectPreviewPage } from '@/features/projects';

export const Route = createFileRoute('/app/projects/$projectId/preview')({
  component: ProjectPreviewRoute,
  validateSearch: (search) =>
    z
      .object({
        branchId: z.string().min(1).optional().catch(undefined),
        languageId: z.string().min(1).optional().catch(undefined),
        pageId: z.string().min(1).optional().catch(undefined),
      })
      .parse(search),
});

function ProjectPreviewRoute() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <ProjectPreviewPage
      projectId={projectId}
      search={search}
      onUpdateSearch={(patch) => {
        navigate({ search: (prev) => ({ ...prev, ...patch }) });
      }}
    />
  );
}
