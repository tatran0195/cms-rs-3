import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { VerifyEmailPage } from '@/features/auth';

export const Route = createFileRoute('/(auth)/verify-email')({
  component: VerifyEmailRoute,
  validateSearch: (search) =>
    z
      .object({
        email: z.string().optional().catch(undefined),
        token: z.string().optional().catch(undefined),
        invite: z.string().optional().catch(undefined),
        delivery: z.enum(['sent', 'failed']).optional().catch(undefined),
      })
      .parse(search),
});

function VerifyEmailRoute() {
  const search = Route.useSearch();
  return <VerifyEmailPage search={search} />;
}
