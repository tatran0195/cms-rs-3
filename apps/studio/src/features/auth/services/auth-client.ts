import type { AuthSession as Session, AuthSessionData as SessionData, AuthUser as User } from '@cms/sdk';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/shared';

export type { Session, SessionData, User };

import { cmsClient } from '@/shared/services/cms-client';

async function wrapSdkCall<T>(call: () => Promise<T>): Promise<{ data?: T; error?: { message?: string; code?: string } }> {
  try {
    const data = await call();
    return { data };
  } catch (err: unknown) {
    const errorObj = err as { message?: string; code?: string };
    const message = errorObj?.message || 'Network error';
    return {
      error: {
        message,
        code: errorObj?.code,
      },
    };
  }
}

export const sessionQueryKey = ['auth', 'session'] as const;

export function useSession() {
  const query = useQuery({
    queryKey: sessionQueryKey,
    queryFn: async (): Promise<SessionData | null> => authClient.getSession(),
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: query.data ?? null,
    isPending: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export const authClient = {
  useSession,
  getSession: async (): Promise<SessionData | null> => (await cmsClient.auth.getSession()) as SessionData | null,
  verifyEmail: async (args: { query: { token: string } }) => wrapSdkCall(() => cmsClient.auth.verifyEmail<{ success?: boolean }>(args.query.token)),
  emailOtp: {
    sendVerificationOtp: async (args: { email: string; type?: string }) =>
      wrapSdkCall(() => cmsClient.auth.sendVerificationOtp<{ success?: boolean }>(args)),
    verifyEmail: async (args: { email: string; otp: string }) => wrapSdkCall(() => cmsClient.auth.verifyEmailOtp<{ success?: boolean }>(args)),
    requestEmailChange: async (args: { newEmail: string; otp: string }) =>
      wrapSdkCall(() => cmsClient.auth.requestEmailChange<{ success?: boolean }>(args)),
    changeEmail: async (args: { newEmail: string; otp: string }) => wrapSdkCall(() => cmsClient.auth.changeEmail<{ success?: boolean }>(args)),
  },
  signIn: {
    emailOtp: async (args: { email: string; otp: string; name?: string }) => {
      const result = await wrapSdkCall(() => cmsClient.auth.signInEmailOtp<SessionData>(args));
      if (result.data) {
        queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      }
      return result;
    },
    social: async (args: { provider: string; callbackURL?: string }) => {
      const result = await wrapSdkCall(() => cmsClient.auth.signInSocial<{ url?: string }>(args));
      if (result.data?.url && typeof window !== 'undefined') {
        window.location.href = result.data.url;
      }
      return result;
    },
  },
  signOut: async () => {
    const result = await wrapSdkCall(() => cmsClient.auth.signOut<{ success?: boolean }>());
    queryClient.setQueryData(sessionQueryKey, null);
    queryClient.clear();
    return result;
  },
  updateUser: async (args: { name?: string; image?: string }) => wrapSdkCall(() => cmsClient.auth.updateUser<{ success?: boolean }>(args)),
  organization: {
    acceptInvitation: async (args: { invitationId: string }) => wrapSdkCall(() => cmsClient.auth.acceptInvitation<{ success?: boolean }>(args)),
  },
  admin: {
    stopImpersonating: async () => wrapSdkCall(() => cmsClient.auth.stopImpersonating<{ success?: boolean }>()),
  },
};

export const signIn = {
  social: authClient.signIn.social,
  emailOtp: authClient.signIn.emailOtp,
};
