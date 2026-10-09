import { createFileRoute, isRedirect, redirect } from '@tanstack/react-router';
import { cmsClient } from '@/shared/services/cms-client';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    try {
      const status = await cmsClient.setup.getStatus();
      if (status.requiresSetup) {
        throw redirect({ to: '/onboarding' });
      }
    } catch (e) {
      if (isRedirect(e)) throw e;
    }
    throw redirect({ to: '/app' });
  },
  component: () => null,
});
