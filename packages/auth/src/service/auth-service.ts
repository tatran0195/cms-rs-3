import type { CmsClient } from '@cms/sdk';
import type {
  AcceptInvitationPayload,
  AuthSessionData,
  ChangeEmailPayload,
  RequestEmailChangePayload,
  SendVerificationOtpPayload,
  SignInEmailOtpPayload,
  SignInSocialPayload,
  SignInSocialResponse,
  UpdateUserPayload,
  VerifyEmailOtpPayload,
} from '../types';

export const authService = {
  getSession: (client: CmsClient): Promise<AuthSessionData | null> => client.auth.getSession(),

  signInEmailOtp: (client: CmsClient, payload: SignInEmailOtpPayload): Promise<AuthSessionData> => client.auth.signInEmailOtp(payload),

  sendVerificationOtp: (client: CmsClient, payload: SendVerificationOtpPayload): Promise<{ status?: boolean }> =>
    client.auth.sendVerificationOtp(payload),

  verifyEmailOtp: (client: CmsClient, payload: VerifyEmailOtpPayload): Promise<{ success?: boolean }> => client.auth.verifyEmailOtp(payload),

  verifyEmail: (client: CmsClient, token: string): Promise<{ success?: boolean }> => client.auth.verifyEmail(token),

  requestEmailChange: (client: CmsClient, payload: RequestEmailChangePayload): Promise<{ success?: boolean }> =>
    client.auth.requestEmailChange(payload),

  changeEmail: (client: CmsClient, payload: ChangeEmailPayload): Promise<{ success?: boolean }> => client.auth.changeEmail(payload),

  signInSocial: (client: CmsClient, payload: SignInSocialPayload): Promise<SignInSocialResponse> => client.auth.signInSocial(payload),

  signOut: (client: CmsClient): Promise<{ success?: boolean }> => client.auth.signOut(),

  updateUser: (client: CmsClient, payload: UpdateUserPayload): Promise<{ success?: boolean }> => client.auth.updateUser(payload),

  acceptInvitation: (client: CmsClient, payload: AcceptInvitationPayload): Promise<{ success?: boolean }> => client.auth.acceptInvitation(payload),

  stopImpersonating: (client: CmsClient): Promise<{ success?: boolean }> => client.auth.stopImpersonating(),
};
