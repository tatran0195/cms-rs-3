import { createFileRoute, Navigate, Outlet, redirect, useLocation } from '@tanstack/react-router';
import { AuthProviders, getSession, useSession } from '@/features/auth';
import { useSetupStatus } from '@/hooks/api';
import { QueryProvider } from '@/shared';
import { cmsClient } from '@/shared/services/cms-client';

export const Route = createFileRoute('/(auth)')({
  beforeLoad: async ({ location }) => {
    try {
      const status = await cmsClient.setup.getStatus();
      if (status.requiresSetup) {
        throw redirect({ to: '/onboarding' });
      }
    } catch (e) {
      if ((e as { isRedirect?: boolean }).isRedirect) throw e;
    }

    if (await getSession()) {
      const firstPublish = location.pathname.endsWith('/sign-up') && new URLSearchParams(location.searchStr).get('intent') === 'first-publish';
      throw redirect({ to: '/app', search: firstPublish ? { firstPublish: true } : {} });
    }
  },
  // Keep every auth utility page (sign-in/up, forgot/reset password, verify
  // email) out of search indexes — some carry live tokens in the URL. Children
  // inherit this; per-page heads only add a title.
  head: () => ({
    meta: [{ name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: AuthRoute,
});

/** Reverse guard: an authenticated user can never see sign-in/up — sent to /app. */
function AuthRoute() {
  return (
    <QueryProvider>
      <AuthProviders>
        <AuthGuard />
      </AuthProviders>
    </QueryProvider>
  );
}

function AuthGuard() {
  const { data: session } = useSession();
  const { data: setupStatus } = useSetupStatus();
  const location = useLocation();

  if (setupStatus?.requiresSetup) {
    return <Navigate to="/onboarding" />;
  }

  // Do not replace the outlet while auth session revalidates on window focus.
  // Unmounting here erased the email/OTP step when users switched to their inbox.
  if (session) {
    const firstPublish = location.pathname.endsWith('/sign-up') && new URLSearchParams(location.searchStr).get('intent') === 'first-publish';
    return <Navigate to="/app" search={firstPublish ? { firstPublish: true } : {}} />;
  }
  return <Outlet />;
}
