import { describe, expect, it } from 'vitest';
import { renderEmailVerificationEmail, renderNewSignInEmail, renderVerificationCodeEmail } from './index';

describe('localized transactional email rendering', () => {
  it('renders an English verification code with a plain-text body', async () => {
    const email = await renderVerificationCodeEmail({ code: '123456', purpose: 'sign-in' });

    expect(email.subject).toBe('Your cms sign-in code');
    expect(email.html).toContain('lang="en"');
    expect(email.html).toContain('src="cid:technostar-logo"');
    expect(email.html).toContain('alt="TechnoStar"');
    expect(email.html).toContain('123456');
    expect(email.text).toContain('123456');
  });

  it('renders Japanese email chrome', async () => {
    const email = await renderNewSignInEmail({ language: 'ja' });

    expect(email.subject).toBe('cms アカウントへの新規サインイン');
    expect(email.html).toContain('dir="ltr"');
    expect(email.html).toContain('lang="ja"');
    expect(email.text).toContain('サインインが検出されました');
  });

  it('escapes a dynamic action URL in HTML while preserving it in text', async () => {
    const email = await renderEmailVerificationEmail({ url: 'https://example.com/verify?token=abc&next=<home>' });

    expect(email.html).toContain('token=abc&amp;next=&lt;home&gt;');
    expect(email.html).not.toContain('next=<home>');
    expect(email.text).toContain('https://example.com/verify?token=abc&next=<home>');
  });
});
