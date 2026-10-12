import type { CmsClient } from '@cms/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignInForm } from './sign-in-form';

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('@cms/design-system/hooks/use-otp-resend-countdown', () => ({
  useOtpResendCountdown: () => ({
    resendIn: 0,
    resetCountdown: vi.fn(),
    startCountdown: vi.fn(),
  }),
}));

if (typeof document !== 'undefined' && !document.elementFromPoint) {
  document.elementFromPoint = vi.fn().mockReturnValue(null);
}

describe('SignInForm', () => {
  it('renders email input and submit button', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const mockClient = {
      auth: {
        sendVerificationOtp: vi.fn(),
        signInEmailOtp: vi.fn(),
        signInSocial: vi.fn(),
        challengeMfa: vi.fn(),
      },
    } as unknown as CmsClient;

    render(
      <QueryClientProvider client={queryClient}>
        <SignInForm client={mockClient} />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText('auth.field.email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'auth.signIn.submit' })).toBeInTheDocument();
  });

  it('renders both Google and GitHub social login buttons when enabled', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const mockClient = {
      auth: {
        sendVerificationOtp: vi.fn(),
        signInEmailOtp: vi.fn(),
        signInSocial: vi.fn(),
        challengeMfa: vi.fn(),
      },
    } as unknown as CmsClient;

    render(
      <QueryClientProvider client={queryClient}>
        <SignInForm client={mockClient} githubEnabled googleEnabled />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: /Google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /GitHub/i })).toBeInTheDocument();
  });

  it('switches to MFA challenge when sign-in response requires 2FA', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const mockClient = {
      auth: {
        sendVerificationOtp: vi.fn().mockResolvedValue({}),
        signInEmailOtp: vi.fn().mockResolvedValue({ mfaRequired: true }),
        signInSocial: vi.fn(),
        challengeMfa: vi.fn(),
      },
    } as unknown as CmsClient;

    render(
      <QueryClientProvider client={queryClient}>
        <SignInForm client={mockClient} />
      </QueryClientProvider>,
    );

    const emailInput = screen.getByLabelText('auth.field.email');
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'auth.signIn.submit' }));

    await waitFor(() => {
      expect(mockClient.auth.sendVerificationOtp).toHaveBeenCalled();
    });

    // Enter 6 digit OTP to trigger sign in
    const otpInput = screen.getByLabelText('auth.otp.label');
    fireEvent.change(otpInput, { target: { value: '123456' } });

    await waitFor(() => {
      expect(mockClient.auth.signInEmailOtp).toHaveBeenCalled();
    });

    // Should now display MFA challenge
    await waitFor(() => {
      expect(screen.getByText('Two-Factor Verification')).toBeInTheDocument();
    });
  });
});
