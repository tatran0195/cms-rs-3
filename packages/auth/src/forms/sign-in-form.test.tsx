import type { CmsClient } from '@cms/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type React from 'react';
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
});
