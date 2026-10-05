import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ProjectsOverviewPage } from '@/features/projects';

export const Route = createFileRoute('/app/(dashboard)/')({
  component: ProjectsRoute,
  validateSearch: (search: Record<string, unknown>): { firstPublish?: boolean; newSite?: boolean } => ({
    ...(search.firstPublish === true || search.firstPublish === 'true' ? { firstPublish: true } : {}),
    ...(search.newSite === true || search.newSite === 'true' ? { newSite: true } : {}),
  }),
});

function ProjectsRoute() {
  const { firstPublish, newSite } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <ProjectsOverviewPage
      firstPublish={firstPublish}
      newSite={newSite}
      onNavigateToEditor={(projectId, search) =>
        void navigate({
          to: '/app/projects/$projectId/editor',
          params: { projectId },
          search,
          replace: true,
        })
      }
      onNavigateToProject={(projectId) =>
        void navigate({
          to: '/app/projects/$projectId',
          params: { projectId },
        })
      }
    />
  );
}
