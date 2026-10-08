import type { CmsClient } from '@cms/sdk';
import { describe, expect, it, vi } from 'vitest';
import { authService } from '../service/auth-service';

describe('authService', () => {
  it('calls getSession on CmsClient auth', async () => {
    const mockSession = {
      user: { id: 'u1', email: 'test@example.com' },
      session: { id: 's1', userId: 'u1' },
    };
    const mockClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue(mockSession),
      },
    } as unknown as CmsClient;

    const res = await authService.getSession(mockClient);
    expect(res).toEqual(mockSession);
    expect(mockClient.auth.getSession).toHaveBeenCalled();
  });

  it('calls signInEmailOtp on CmsClient auth', async () => {
    const mockSession = {
      user: { id: 'u1', email: 'test@example.com' },
      session: { id: 's1', userId: 'u1' },
    };
    const mockClient = {
      auth: {
        signInEmailOtp: vi.fn().mockResolvedValue(mockSession),
      },
    } as unknown as CmsClient;

    const payload = { email: 'test@example.com', otp: '123456' };
    const res = await authService.signInEmailOtp(mockClient, payload);
    expect(res).toEqual(mockSession);
    expect(mockClient.auth.signInEmailOtp).toHaveBeenCalledWith(payload);
  });

  it('calls signOut on CmsClient auth', async () => {
    const mockClient = {
      auth: {
        signOut: vi.fn().mockResolvedValue({ success: true }),
      },
    } as unknown as CmsClient;

    const res = await authService.signOut(mockClient);
    expect(res).toEqual({ success: true });
    expect(mockClient.auth.signOut).toHaveBeenCalled();
  });
});
