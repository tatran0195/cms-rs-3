import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SitesListPage } from '@/features/projects';

export const Route = createFileRoute('/app/(dashboard)/sites')({
  component: SitesRoute,
  validateSearch: (search: Record<string, unknown>): { newSite?: boolean } =>
    search.newSite === true || search.newSite === 'true' ? { newSite: true } : {},
});

function SitesRoute() {
  const { newSite } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <SitesListPage
      newSite={newSite}
      onNavigateToProject={(projectId) =>
        void navigate({
          to: '/app/projects/$projectId',
          params: { projectId },
        })
      }
    />
  );
}
