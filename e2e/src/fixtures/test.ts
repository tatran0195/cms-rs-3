import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import { attachDiagnostics, type Diagnostics } from '../support/diagnostics';
import { Database } from '../support/db';
import { ReleaseInspector } from '../support/releases';
import { Mailbox } from '../support/mail';
import { uniqueEmail, uniqueName } from '../support/data';
import { DashboardPage } from '../pages/dashboard.page';
import { EditorPage } from '../pages/editor.page';
import { PublishControl } from '../pages/publish.page';
import { PublicSite } from '../pages/site.page';
import { SignInPage } from '../pages/signin.page';
import { ForgedApi } from '../support/forged-api';
import { BrowserApi } from '../support/browser-api';

export interface Session {
  email: string;
  userId: string;
  organizationId: string;
}

/**
 * A ready-to-use documentation site, created through the browser UI by the
 * signed-in author. Tests receive it instead of a bare page so each test starts
 * from a realistic, independent state.
 */
export interface Site {
  id: string;
  name: string;
  /** BCP-47 code of the default language every new site is created with. */
  defaultLanguage: string;
}

export interface WorkerFixtures {
  mailbox: Mailbox;
  db: Database;
  /** Stable per-worker identity so repeated runs reuse (or refresh) one account. */
  workerSession: Session;
}

export interface TestFixtures {
  diagnostics: Diagnostics;
  session: Session;
  signIn: SignInPage;
  dashboard: DashboardPage;
  editor: EditorPage;
  publish: PublishControl;
  site: PublicSite;
  /** Signed-in author account created (and logged in) for this test. */
  author: Session;
  /** A fresh documentation site owned by the test's author. */
  project: Site;
  /** A second, separate account for authorization / concurrency scenarios. */
  secondAuthor: Session;
  /** A second browser context signed in as `secondAuthor`. */
  secondContext: BrowserContext;
  /**
   * Unauthenticated HTTP client with no cookies. Used only to replay stale or
   * forged payloads a real browser cannot produce (a consumed OTP, an id from
   * another tenant). It creates no product state.
   */
  forgedRequest: ForgedApi;
  /**
   * The product's own API, called from inside the authenticated page. Used for
   * independent verification and for the handful of operations the studio has
   * no affordance for (see tests/defects).
   */
  browserApi: BrowserApi;
  /** Read-only view of what each release actually froze. */
  releases: ReleaseInspector;
}

/**
 * Worker-scoped infrastructure. Declared separately so Playwright keeps the
 * worker/test boundary: the mailbox, the read/write handle and one reused
 * signed-in account per worker live for the whole file's worker lifetime.
 */
const workerFixtures = base.extend<{}, WorkerFixtures>({
  mailbox: [async ({}, use) => { await use(Mailbox.fromEnv()); }, { scope: 'worker' }],

  db: [async ({}, use) => { await use(Database.fromEnv()); }, { scope: 'worker' }],

  workerSession: [
    async ({ browser, mailbox }, use, workerInfo) => {
      const email = `owner.w${workerInfo.workerIndex}.e2e@cms-e2e.local`;
      const session = await ensureAccount(browser, email, mailbox);
      await use(session);
    },
    { scope: 'worker' },
  ],
});

export const test = workerFixtures.extend<TestFixtures>({
  // ── Per-test instrumentation ───────────────────────────────────────────────
  diagnostics: async ({ page }, use) => {
    await use(attachDiagnostics(page));
  },

  // ── Page objects ──────────────────────────────────────────────────────────
  signIn: async ({ page }, use) => {
    await use(new SignInPage(page));
  },

  dashboard: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  editor: async ({ page }, use) => {
    await use(new EditorPage(page));
  },

  publish: async ({ page }, use) => {
    await use(new PublishControl(page));
  },

  site: async ({ page }, use) => {
    await use(new PublicSite(page));
  },

  // ── Accounts ──────────────────────────────────────────────────────────────
  session: async ({ workerSession }, use) => {
    await use(workerSession);
  },

  author: async ({ page, signIn, mailbox }, use) => {
    const email = uniqueEmail('author');
    const before = mailbox.latestTimestamp();
    await signIn.signIn(email, mailbox);
    const user = await userIdFor(email, mailbox, before);
    await use({ ...user, email });
  },

  // ── Project fixture (created through the UI) ──────────────────────────────
  project: async ({ page, dashboard, author }, use) => {
    const name = uniqueName('Docs');
    const created = await dashboard.createSite(name);
    const site: Site = { id: created.id, name: created.name, defaultLanguage: 'en' };
    await use(site);
  },

  // ── Second account for authorization + concurrency ────────────────────────
  secondAuthor: async ({ browser, mailbox }, use) => {
    const email = uniqueEmail('member');
    const session = await ensureAccount(browser, email, mailbox);
    await use(session);
  },

  browserApi: async ({ page }, use) => {
    await use(new BrowserApi(page));
  },

  releases: async ({ db }, use) => {
    await use(new ReleaseInspector(db));
  },

  forgedRequest: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({
      baseURL: baseURL ?? 'http://127.0.0.1:3000',
    });
    await use(ForgedApi.fromContext(context, baseURL ?? 'http://127.0.0.1:3000'));
    await context.dispose();
  },

  secondContext: async ({ browser, secondAuthor, mailbox }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await new SignInPage(page).signIn(secondAuthor.email, mailbox);
    await use(context);
    await context.close();
  },
});

export { expect };

/**
 * Create (or reuse) a real account by completing the passwordless sign-in
 * through the browser. The OTP is read from the mailbox the SMTP sink writes to,
 * so the genuine auth path — including token persistence and session cookie
 * issuance — always runs.
 */
async function ensureAccount(browser: Browser, email: string, mailbox: Mailbox): Promise<Session> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await new SignInPage(page).signIn(email, mailbox);
    const db = Database.fromEnv();
    const row = await db.one<{ id: string; organization_id: string }>(
      `SELECT u.id AS id,
              COALESCE(m.organization_id, '') AS organization_id
         FROM "User" u
         LEFT JOIN "Member" m ON m.user_id = u.id
        WHERE u.email = $1
        ORDER BY m.created_at NULLS LAST
        LIMIT 1`,
      [email],
    );
    return { email, userId: row.id, organizationId: row.organization_id };
  } finally {
    await context.close();
  }
}

async function userIdFor(email: string, mailbox: Mailbox, _since: number): Promise<{ userId: string; organizationId: string }> {
  const db = Database.fromEnv();
  const row = await db.one<{ id: string; organization_id: string }>(
    `SELECT u.id AS id, COALESCE((SELECT organization_id FROM "Member" WHERE user_id = u.id LIMIT 1), '') AS organization_id
       FROM "User" u WHERE u.email = $1`,
    [email],
  );
  void mailbox;
  return { userId: row.id, organizationId: row.organization_id };
}

export type { Page };