import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SignUpPage } from '@/features/auth';

export const Route = createFileRoute('/(auth)/sign-up')({
  validateSearch: (search) =>
    z
      .object({
        invite: z.string().optional().catch(undefined),
        email: z.string().optional().catch(undefined),
        intent: z.literal('first-publish').optional().catch(undefined),
      })
      .parse(search),
  head: () => ({
    meta: [{ title: 'Sign up — cms' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: SignUpRoute,
});

function SignUpRoute() {
  const search = Route.useSearch();
  return <SignUpPage search={search} />;
}
