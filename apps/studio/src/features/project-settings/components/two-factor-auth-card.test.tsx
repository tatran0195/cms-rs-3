// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwoFactorAuthCard } from './two-factor-auth-card';

let mockUser: { id: string; email: string; mfa_enabled?: boolean } = {
  id: 'u-1',
  email: 'test@example.com',
  mfa_enabled: false,
};

const setupMutateAsync = vi.fn().mockResolvedValue({
  secret: 'JBSWY3DPEHPK3PXP',
  qrPngBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY44YAAAAASUVORK5CYII=',
  otpauthUri: 'otpauth://totp/CMS:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=CMS',
  recoveryCodes: ['code-1', 'code-2', 'code-3', 'code-4', 'code-5', 'code-6', 'code-7', 'code-8'],
});

const verifyMutateAsync = vi.fn().mockResolvedValue({ success: true });

const disableMutateAsync = vi.fn().mockResolvedValue({ success: true });

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({
    data: { user: mockUser },
    refetch: vi.fn(),
  }),
  useMfaSetup: () => ({
    mutateAsync: setupMutateAsync,
    isPending: false,
  }),
  useMfaVerify: () => ({
    mutateAsync: verifyMutateAsync,
    isPending: false,
  }),
  useMfaDisable: () => ({
    mutateAsync: disableMutateAsync,
    isPending: false,
  }),
}));

describe('TwoFactorAuthCard', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    mockUser = { id: 'u-1', email: 'test@example.com', mfa_enabled: false };
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    vi.clearAllMocks();
  });

  it('renders disabled status when user has not enabled MFA', async () => {
    const root = createRoot(container);
    await act(async () => root.render(<TwoFactorAuthCard />));

    expect(container.textContent).toContain('Two-Factor Authentication');
    expect(container.textContent).toContain('Disabled');
    expect(container.querySelector('button')?.textContent).toContain('Enable 2FA');

    act(() => root.unmount());
  });

  it('renders enabled status when user has MFA enabled', async () => {
    mockUser.mfa_enabled = true;
    const root = createRoot(container);
    await act(async () => root.render(<TwoFactorAuthCard />));

    expect(container.textContent).toContain('Enabled');
    expect(container.querySelector('button')?.textContent).toContain('Disable 2FA');

    act(() => root.unmount());
  });
});
