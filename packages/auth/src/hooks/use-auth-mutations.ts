import type { CmsClient } from '@cms/sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '../service/auth-service';
import type {
  AcceptInvitationPayload,
  ChangeEmailPayload,
  RequestEmailChangePayload,
  SendVerificationOtpPayload,
  SignInEmailOtpPayload,
  SignInSocialPayload,
  UpdateUserPayload,
  VerifyEmailOtpPayload,
} from '../types';
import { authKeys } from './keys';

export function useSignInEmailOtp(client: CmsClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SignInEmailOtpPayload) => authService.signInEmailOtp(client, payload),
    onSuccess: (session) => {
      queryClient.setQueryData(authKeys.session(), session);
    },
  });
}

export function useSendVerificationOtp(client: CmsClient) {
  return useMutation({
    mutationFn: (payload: SendVerificationOtpPayload) => authService.sendVerificationOtp(client, payload),
  });
}

export function useVerifyEmailOtp(client: CmsClient) {
  return useMutation({
    mutationFn: (payload: VerifyEmailOtpPayload) => authService.verifyEmailOtp(client, payload),
  });
}

export function useVerifyEmail(client: CmsClient) {
  return useMutation({
    mutationFn: (token: string) => authService.verifyEmail(client, token),
  });
}

export function useRequestEmailChange(client: CmsClient) {
  return useMutation({
    mutationFn: (payload: RequestEmailChangePayload) => authService.requestEmailChange(client, payload),
  });
}

export function useChangeEmail(client: CmsClient) {
  return useMutation({
    mutationFn: (payload: ChangeEmailPayload) => authService.changeEmail(client, payload),
  });
}

export function useSignInSocial(client: CmsClient) {
  return useMutation({
    mutationFn: async (payload: SignInSocialPayload) => {
      const result = await authService.signInSocial(client, payload);
      if (result.url && typeof window !== 'undefined') {
        window.location.href = result.url;
      }
      return result;
    },
  });
}

export function useSignOut(client: CmsClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authService.signOut(client),
    onSuccess: () => {
      queryClient.setQueryData(authKeys.session(), null);
      queryClient.clear();
    },
  });
}

export function useUpdateUser(client: CmsClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateUserPayload) => authService.updateUser(client, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.session() });
    },
  });
}

export function useAcceptInvitation(client: CmsClient) {
  return useMutation({
    mutationFn: (payload: AcceptInvitationPayload) => authService.acceptInvitation(client, payload),
  });
}

export function useStopImpersonating(client: CmsClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authService.stopImpersonating(client),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.session() });
    },
  });
}
