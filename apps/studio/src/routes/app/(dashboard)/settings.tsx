import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { isWorkspaceSettingsTab, WorkspaceSettingsPage, type WorkspaceSettingsTab } from '@/features/project-settings';

export const Route = createFileRoute('/app/(dashboard)/settings')({
  component: WorkspaceSettingsRoute,
  validateSearch: (search: Record<string, unknown>): { tab: WorkspaceSettingsTab } => ({
    tab: isWorkspaceSettingsTab(search.tab) ? search.tab : 'account',
  }),
});

function WorkspaceSettingsRoute() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return <WorkspaceSettingsPage tab={tab} onTabChange={(next) => navigate({ search: { tab: next }, replace: true })} />;
}
