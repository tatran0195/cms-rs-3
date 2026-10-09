import type { HttpClient } from '../http';

export interface SetupStatus {
  isInitialized: boolean;
  requiresSetup: boolean;
  configuredOauthProviders: string[];
}

export interface CompleteSetupPayload {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceLogoUrl?: string;
  workspaceDescription?: string;
  allowPublicSignup: boolean;
  requireEmailVerification: boolean;
  enabledOauthProviders: string[];
  defaultTheme: string;
  defaultLocale: string;
}

export interface CompleteSetupResult {
  success: boolean;
  user: Record<string, unknown>;
  redirectUrl: string;
}

export class SetupResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get public setup status
   */
  async getStatus(): Promise<SetupStatus> {
    return this.http.get<SetupStatus>('/api/public/setup/status');
  }

  /**
   * Complete setup and initialize platform
   */
  async complete(payload: CompleteSetupPayload): Promise<CompleteSetupResult> {
    return this.http.post<CompleteSetupResult>('/api/public/setup/complete', payload);
  }
}
