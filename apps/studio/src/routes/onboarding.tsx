import { createFileRoute, isRedirect, redirect } from '@tanstack/react-router';
import { OnboardingWizard } from '@/features/onboarding';
import { QueryProvider } from '@/shared';
import { cmsClient } from '@/shared/services/cms-client';

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async () => {
    try {
      const status = await cmsClient.setup.getStatus();
      if (!status.requiresSetup) {
        throw redirect({ to: '/app' });
      }
    } catch (e) {
      if (isRedirect(e)) throw e;
    }
  },
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Platform Setup — cms' },
    ],
  }),
  component: OnboardingRoute,
});

function OnboardingRoute() {
  return (
    <QueryProvider>
      <OnboardingWizard />
    </QueryProvider>
  );
}
