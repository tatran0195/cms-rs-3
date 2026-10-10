import { expect, test } from '../../src/fixtures/test';
import { uniqueEmail } from '../../src/support/data';

/**
 * Authentication and session lifecycle.
 *
 * The product is passwordless: sign-in is an emailed one-time code. These tests
 * exercise the genuine flow, including the failure paths a real person hits
 * (wrong code, reused code, unknown address, signed-out tabs).
 */
test.describe('authentication', () => {
  test('signs in through the emailed one-time code and lands in the workspace', async ({ page, signIn, mailbox, diagnostics }) => {
    const email = uniqueEmail('login');

    await signIn.signIn(email, mailbox);

    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByRole('heading', { name: 'Your sites' })).toBeVisible();
    // The shell shows the signed-in identity, not a generic account button.
    await expect(page.getByRole('button', { name: new RegExp(email) }).first()).toBeVisible();
    diagnostics.assertClean({ label: 'sign-in: ' });
  });

  test('rejects an incorrect code, stays signed out, then accepts the real one', async ({ page, signIn, mailbox, diagnostics }) => {
    const email = uniqueEmail('otp');
    await signIn.requestCode(email);
    const realCode = await mailbox.waitForOtp(email);

    // The rejected attempt answers 401 and the browser logs the failed
    // resource; that is the behaviour under test, declared explicitly.
    diagnostics.expectFailure('HTTP 401 POST .*sign-in/email-otp');
    diagnostics.expectFailure('Failed to load resource.*401');

    await signIn.enterCode('000000');
    await signIn.expectVisibleError(/invalid or expired/i);
    await expect(page).toHaveURL(/\/sign-in/);

    // The rejected attempt must not have consumed the legitimate code.
    await signIn.enterCode(realCode);
    await page.waitForURL(/\/app/, { timeout: 30_000 });
    diagnostics.assertClean({ label: 'otp recovery: ' });
  });

  test('asking for a second code for the same address is rate limited and grants no session', async ({ page, signIn, mailbox, diagnostics }) => {
    const email = uniqueEmail('ratelimit');
    await signIn.requestCode(email);
    const first = await mailbox.waitForOtp(email);

    // The product limits one code per address per window. The second attempt
    // must be refused visibly, and must not create a session — the 429 and its
    // logged resource are the behaviour under test.
    diagnostics.expectFailure('HTTP 429 POST .*send-verification-otp');
    diagnostics.expectFailure('Failed to load resource.*429');

    await page.reload();
    await signIn.goto();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(signIn.rateLimitMessage()).toBeVisible({ timeout: 20_000 });

    await expect(page).not.toHaveURL(/\/app(\/|$)/);
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
    expect(first).toMatch(/^\d{6}$/);

    diagnostics.assertClean({ label: 'otp rate limit: ' });
  });

  test('a consumed one-time code cannot be replayed for a second session', async ({ page, signIn, mailbox, forgedRequest, diagnostics }) => {
    const email = uniqueEmail('replay');
    await signIn.requestCode(email);
    const code = await mailbox.waitForOtp(email);
    await signIn.enterCode(code);
    await page.waitForURL(/\/app/, { timeout: 30_000 });

    // Replay the exact code that just produced a session, from a context that
    // holds no cookies at all. A one-time code must not be reusable.
    const response = await forgedRequest.request('/api/auth/sign-in/email-otp', {
      method: 'POST',
      data: { email, otp: code },
    });
    expect(response.status, 'a consumed OTP must not mint a new session').toBeGreaterThanOrEqual(400);

    // And the freshly issued session is untouched by the replay attempt.
    await page.goto('/app');
    await expect(page.getByRole('heading', { name: 'Your sites' })).toBeVisible();

    diagnostics.assertClean({ label: 'otp replay: ' });
  });

  test('the one-time code field is cleared after a failed attempt so it can be retyped', async ({ page, signIn, mailbox, diagnostics }) => {
    // Regression coverage for DEFECT-02 (fixed in this repository): the field
    // used to keep the mistyped six digits at maxLength, so typing the correct
    // code did nothing and the user was stuck on the sign-in screen.
    const email = uniqueEmail('otpclear');
    await signIn.requestCode(email);
    const real = await mailbox.waitForOtp(email);

    diagnostics.expectFailure('HTTP 401 POST .*sign-in/email-otp');
    diagnostics.expectFailure('Failed to load resource.*401');

    await signIn.enterCode('000000');
    await signIn
      .expectVisibleError(/invalid or expired/i)
      .first()
      .waitFor({ timeout: 20_000 });

    await expect.poll(() => signIn.otpFieldValue(), { message: 'the OTP field must be empty after a failure' }).toBe('');

    // A person simply types the right code next; no manual clearing needed.
    await page.locator('input#otp').click();
    await page.keyboard.type(real, { delay: 30 });
    await page.waitForURL(/\/app/, { timeout: 30_000 });

    diagnostics.assertClean({ label: 'otp field recovery: ' });
  });

  test('signing out invalidates the session for protected routes', async ({ page, signIn, dashboard, mailbox, db, diagnostics }) => {
    const email = uniqueEmail('session');
    await signIn.signIn(email, mailbox);
    const site = await dashboard.createSite('E2E Session Site');
    const projectId = site.id;

    // An authenticated deep link into project settings must resolve, not bounce.
    await page.goto(`/app/projects/${projectId}/settings`);
    await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/settings`));
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toHaveCount(0);

    await signIn.signOut(email);
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();

    // Direct navigation to a protected URL must not resurrect the session.
    await page.goto(`/app/projects/${projectId}/editor`);
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();

    // And the server-side session row must be gone, not merely hidden client-side.
    const rows = await db.count('SELECT count(*) AS count FROM "Session" s JOIN "User" u ON u.id = s.user_id WHERE u.email = $1', [email]);
    expect(rows, 'sessions should be revoked server-side on sign out').toBe(0);

    diagnostics.assertClean({ label: 'sign out: ' });
  });

  test('session survives a full browser reload and a navigation away and back', async ({ page, signIn, dashboard, mailbox, diagnostics }) => {
    const email = uniqueEmail('persist');
    await signIn.signIn(email, mailbox);
    const site = await dashboard.createSite('E2E Persist Site');

    await page.goto(`/app/projects/${site.id}/editor`);
    await page.reload();
    await expect(page.getByRole('button', { name: 'New page' }).first()).toBeVisible({ timeout: 30_000 });

    await page.goto('/app');
    await page.goto(`/app/projects/${site.id}/editor`);
    await expect(page.getByRole('button', { name: 'New page' }).first()).toBeVisible({ timeout: 30_000 });

    diagnostics.assertClean({ label: 'session persistence: ' });
  });

  test('an unauthenticated visitor cannot deep-link into a project', async ({ page, diagnostics }) => {
    const response = await page.goto('/app/projects/00000000-0000-0000-0000-000000000000/editor');
    // Either a redirect to sign-in or an access boundary — never the editor.
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
    expect(response?.status() ?? 200).toBeLessThan(500);
    diagnostics.assertClean({ label: 'unauthenticated deep link: ' });
  });
});
