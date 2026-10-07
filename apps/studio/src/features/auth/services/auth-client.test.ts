import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cmsClient } from '@/shared/services/cms-client';
import { authClient, signIn } from './auth-client';

describe('Auth Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sendVerificationOtp calls cmsClient.auth.sendVerificationOtp', async () => {
    const spy = vi.spyOn(cmsClient.auth, 'sendVerificationOtp').mockResolvedValue({ status: true });

    const res = await authClient.emailOtp.sendVerificationOtp({
      email: 'test@example.com',
      type: 'sign-in',
    });

    expect(spy).toHaveBeenCalledWith({
      email: 'test@example.com',
      type: 'sign-in',
    });
    expect(res.data).toEqual({ status: true });
  });

  it('signOut calls cmsClient.auth.signOut', async () => {
    const spy = vi.spyOn(cmsClient.auth, 'signOut').mockResolvedValue({ success: true });

    const res = await authClient.signOut();
    expect(spy).toHaveBeenCalled();
    expect(res.data).toEqual({ success: true });
  });

  it('signIn.emailOtp calls cmsClient.auth.signInEmailOtp', async () => {
    const spy = vi.spyOn(cmsClient.auth, 'signInEmailOtp').mockResolvedValue({
      user: { id: 'u1', email: 'test@example.com' },
      session: { id: 's1', userId: 'u1' },
    });

    const res = await signIn.emailOtp({
      email: 'test@example.com',
      otp: '123456',
    });

    expect(spy).toHaveBeenCalledWith({
      email: 'test@example.com',
      otp: '123456',
    });
    expect(res.data?.user.id).toBe('u1');
  });
});
