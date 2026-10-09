import { expect, type Locator, type Page } from '@playwright/test';

import type { Mailbox } from '../support/mail';

/**
 * The real passwordless sign-in: type an address, ask for a one-time code,
 * read the code the backend actually emailed, and submit it.
 *
 * There is no test-only back door into an authenticated session — every test
 * signs in the way an employee does.
 */
export class SignInPage {
  private readonly emailInput: Locator;
  private readonly otpInput: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.getByLabel('Email', { exact: true });
    this.otpInput = page.locator('input#otp');
  }

  async goto(): Promise<void> {
    await this.page.goto('/sign-in');
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.emailInput).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Fast API login: requests a session cookie via the backend API and attaches
   * it to the browser context, navigating directly to the target URL.
   */
  async loginViaApi(email = 'admin@example.com', password = 'Password123!', targetUrl = '/app'): Promise<void> {
    const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4310';
    const apiTarget = baseURL.includes(':4310') ? 'http://localhost:3000' : baseURL;
    const res = await fetch(`${apiTarget}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const setCookie = res.headers.get('set-cookie');
    const tokenMatch = setCookie?.match(/cms_session=([^;]+)/);
    if (tokenMatch) {
      const urlObj = new URL(baseURL);
      await this.page.context().addCookies([
        {
          name: 'cms_session',
          value: tokenMatch[1],
          domain: urlObj.hostname,
          path: '/',
        },
      ]);
    }
    await this.page.goto(targetUrl);
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Full UI login: request the code through the form, then enter the emailed OTP. */
  async signIn(email: string, mailbox: Mailbox): Promise<void> {
    await this.goto();
    const since = mailbox.latestTimestamp();
    await this.emailInput.fill(email);
    await this.page.getByRole('button', { name: 'Log in', exact: true }).click();

    // The UI must move to the code step before we go looking for mail.
    await expect(this.page.getByText(`Enter the code sent to ${email}`)).toBeVisible();

    const code = await mailbox.waitForOtp(email, { since });
    await this.enterCode(code);
    await this.page.waitForURL(/\/app/, { timeout: 30_000 });
  }

  /**
   * Type a code the way a person does: focus the field and press keys.
   *
   * The field is a single hidden input (`maxlength=6`) that drives six visual
   * slots. Anything already in it is cleared first, exactly as a user who sees
   * stale digits would select-all and delete before retyping.
   */
  async enterCode(code: string): Promise<void> {
    await this.otpInput.click();
    await this.page.keyboard.press('ControlOrMeta+A');
    await this.page.keyboard.press('Backspace');
    await this.page.keyboard.type(code, { delay: 30 });
  }

  /** The current contents of the one-time-code field (diagnostics/debugging). */
  async otpFieldValue(): Promise<string> {
    return this.otpInput.inputValue();
  }

  /** The message the product shows when an address asks for too many codes. */
  rateLimitMessage(): Locator {
    return this.page.getByText(/too many requests/i).first();
  }

  /** True when the product is showing its request-rate-limit message. */
  async showsRateLimit(): Promise<boolean> {
    return this.rateLimitMessage().isVisible();
  }

  /** Ask for a code for `email` and stop on the OTP step (no submission). */
  async requestCode(email: string): Promise<void> {
    await this.goto();
    await this.emailInput.fill(email);
    await this.page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(this.page.getByText(`Enter the code sent to ${email}`)).toBeVisible();
  }

  /** The account menu trigger is the only control that shows the signed-in address. */
  static accountTrigger(page: Page, email: string): Locator {
    return page.getByRole('button', { name: new RegExp(escapeRegExp(email)) }).first();
  }

  static expectSignedIn(page: Page, email: string): void {
    expect(SignInPage.accountTrigger(page, email)).toBeVisible();
  }

  /** The visible error the form shows for a bad or reused code. */
  expectVisibleError(pattern: RegExp | string): Locator {
    return this.page.getByText(pattern);
  }

  /** Real logout for the address this page object signed in with. */
  async signOut(email: string): Promise<void> {
    await SignInPage.signOut(this.page, email);
  }

  /** Real logout through the account menu, then confirm the shell is gone. */
  static async signOut(page: Page, email: string): Promise<void> {
    await SignInPage.accountTrigger(page, email).click();
    const signOutItem = page.getByRole('menuitem', { name: 'Sign out' });
    await signOutItem.waitFor({ state: 'visible' });
    await signOutItem.click();
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible({ timeout: 30_000 });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}