import type { HttpClient } from '../http';
import type {
  AcceptInvitationPayload,
  AuthSession,
  AuthSessionData,
  AuthUser,
  ChangeEmailPayload,
  RequestEmailChangePayload,
  SendVerificationOtpPayload,
  SignInEmailOtpPayload,
  SignInSocialPayload,
  SignInSocialResponse,
  UpdateUserPayload,
  VerifyEmailOtpPayload,
} from '../types';

export type {
  AcceptInvitationPayload,
  AuthSession,
  AuthSessionData,
  AuthUser,
  ChangeEmailPayload,
  RequestEmailChangePayload,
  SendVerificationOtpPayload,
  SignInEmailOtpPayload,
  SignInSocialPayload,
  SignInSocialResponse,
  UpdateUserPayload,
  VerifyEmailOtpPayload,
};

export class AuthResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Retrieves active session if user is authenticated, or null
   */
  async getSession(): Promise<AuthSessionData | null> {
    try {
      const res = await this.http.get<AuthSessionData | null>('/api/auth/get-session');
      return res?.user ? res : null;
    } catch {
      return null;
    }
  }

  /**
   * Traditional email/password login
   */
  async login<T = unknown>(payload: unknown): Promise<T> {
    return this.http.post<T>('/api/auth/login', payload);
  }

  /**
   * User registration
   */
  async register<T = unknown>(payload: unknown): Promise<T> {
    return this.http.post<T>('/api/auth/register', payload);
  }

  /**
   * Sends email verification OTP
   */
  async sendVerificationOtp<T = { status?: boolean }>(payload: SendVerificationOtpPayload): Promise<T> {
    return this.http.post<T>('/api/auth/email-otp/send-verification-otp', payload);
  }

  /**
   * Verifies email OTP
   */
  async verifyEmailOtp<T = { success?: boolean }>(payload: VerifyEmailOtpPayload): Promise<T> {
    return this.http.post<T>('/api/auth/email-otp/verify-email', payload);
  }

  /**
   * Sign in using email OTP code
   */
  async signInEmailOtp<T = AuthSessionData>(payload: SignInEmailOtpPayload): Promise<T> {
    return this.http.post<T>('/api/auth/sign-in/email-otp', payload);
  }

  /**
   * Request email change OTP
   */
  async requestEmailChange<T = { success?: boolean }>(payload: RequestEmailChangePayload): Promise<T> {
    return this.http.post<T>('/api/auth/email-otp/request-email-change', payload);
  }

  /**
   * Confirm email change with OTP
   */
  async changeEmail<T = { success?: boolean }>(payload: ChangeEmailPayload): Promise<T> {
    return this.http.post<T>('/api/auth/email-otp/change-email', payload);
  }

  /**
   * Initiates social OAuth sign-in flow
   */
  async signInSocial<T = SignInSocialResponse>(payload: SignInSocialPayload): Promise<T> {
    return this.http.post<T>('/api/auth/sign-in/social', payload);
  }

  /**
   * Verifies email via token query parameter
   */
  async verifyEmail<T = { success?: boolean }>(token: string): Promise<T> {
    return this.http.get<T>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  }

  /**
   * Terminates active session
   */
  async signOut<T = { success?: boolean }>(): Promise<T> {
    return this.http.post<T>('/api/auth/sign-out', {});
  }

  /**
   * Updates profile attributes of currently signed-in user
   */
  async updateUser<T = { success?: boolean }>(payload: UpdateUserPayload): Promise<T> {
    return this.http.post<T>('/api/auth/update-user', payload);
  }

  /**
   * Accepts invitation token
   */
  async acceptInvitation<T = { success?: boolean }>(payload: AcceptInvitationPayload): Promise<T> {
    return this.http.post<T>('/api/auth/invitations/accept', payload);
  }

  /**
   * Exits impersonation session
   */
  async stopImpersonating<T = { success?: boolean }>(): Promise<T> {
    return this.http.post<T>('/api/auth/admin/stop-impersonating', {});
  }
}
