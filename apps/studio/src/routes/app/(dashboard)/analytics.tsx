import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceAnalyticsPage } from '@/features/analytics';

export const Route = createFileRoute('/app/(dashboard)/analytics')({
  component: WorkspaceAnalyticsPage,
});
