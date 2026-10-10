import {
  authKeys,
  authService,
  useAcceptInvitation as useAuthAcceptInvitation,
  useChangeEmail as useAuthChangeEmail,
  useRequestEmailChange as useAuthRequestEmailChange,
  useSendVerificationOtp as useAuthSendVerificationOtp,
  useSession as useAuthSession,
  useSignInEmailOtp as useAuthSignInEmailOtp,
  useSignInSocial as useAuthSignInSocial,
  useSignOut as useAuthSignOut,
  useStopImpersonating as useAuthStopImpersonating,
  useUpdateUser as useAuthUpdateUser,
  useVerifyEmail as useAuthVerifyEmail,
  useVerifyEmailOtp as useAuthVerifyEmailOtp,
} from '@cms/auth';
import { cmsClient } from '@/shared/services/cms-client';

export { AcceptInvitePage } from './AcceptInvitePage';
export { AuthLayout } from './components/AuthLayout';
export { AuthProviders } from './components/AuthProviders';
export { ForgotPasswordPage } from './ForgotPasswordPage';
export { ResetPasswordPage } from './ResetPasswordPage';
export { SignInPage } from './SignInPage';
export { SignUpPage } from './SignUpPage';
export { authDocumentTitle } from './utils/auth-document-title';
export { isEmailNotVerifiedError } from './utils/auth-errors';
export { VerifyEmailPage } from './VerifyEmailPage';

export const sessionQueryKey = authKeys.session();

export const useSession = () => useAuthSession(cmsClient);
export const useSignOut = () => useAuthSignOut(cmsClient);
export const useSignInEmailOtp = () => useAuthSignInEmailOtp(cmsClient);
export const useSignInSocial = () => useAuthSignInSocial(cmsClient);
export const useSendVerificationOtp = () => useAuthSendVerificationOtp(cmsClient);
export const useVerifyEmailOtp = () => useAuthVerifyEmailOtp(cmsClient);
export const useVerifyEmail = () => useAuthVerifyEmail(cmsClient);
export const useRequestEmailChange = () => useAuthRequestEmailChange(cmsClient);
export const useChangeEmail = () => useAuthChangeEmail(cmsClient);
export const useUpdateUser = () => useAuthUpdateUser(cmsClient);
export const useAcceptInvitation = () => useAuthAcceptInvitation(cmsClient);
export const useStopImpersonating = () => useAuthStopImpersonating(cmsClient);

export const getSession = () => authService.getSession(cmsClient);
export type { AuthSession, AuthSessionData, AuthUser } from '@cms/auth';
export { authKeys, authService };
