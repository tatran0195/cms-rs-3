import { createFileRoute, Navigate, Outlet, redirect } from '@tanstack/react-router';
import { authClient, useSession } from '@/features/auth';
import { ProjectProvider } from '@/features/projects';
import { SupportAccessBanner } from '@/features/workspace';
import { AppProviders, PageLoader, QueryProvider } from '@/shared';

export const Route = createFileRoute('/app')({
  beforeLoad: async () => {
    const routeSession = await authClient.getSession();
    if (!routeSession) {
      throw redirect({ to: '/sign-in' });
    }
    return { routeSession };
  },
  head: () => ({
    meta: [{ name: 'robots', content: 'noindex' }],
  }),
  component: AppRoute,
});

/** Forward guard: signed-out users go to sign-in; the rest get the app. */
function AppRoute() {
  return (
    <QueryProvider>
      <AppProviders>
        <AppGuard />
      </AppProviders>
    </QueryProvider>
  );
}

function AppGuard() {
  const { routeSession } = Route.useRouteContext();
  const { data: session, isPending } = useSession();
  const resolvedSession = session ?? (isPending ? routeSession : null);

  if (isPending && !resolvedSession) {
    return <PageLoader />;
  }
  if (!resolvedSession) return <Navigate to="/sign-in" />;
  const supportSession = resolvedSession as {
    session?: { impersonatedBy?: string | null };
    user?: { id?: string | null; name?: string | null; email?: string | null };
  };
  const impersonatedBy = supportSession.session?.impersonatedBy;
  return (
    <div className={impersonatedBy ? 'pb-14' : undefined}>
      <ProjectProvider>
        <Outlet />
      </ProjectProvider>
      {impersonatedBy && supportSession.user?.id ? (
        <SupportAccessBanner customerId={supportSession.user.id} customerName={supportSession.user.name || supportSession.user.email} />
      ) : null}
    </div>
  );
}
