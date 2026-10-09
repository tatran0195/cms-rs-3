import { defineConfig, devices, type Project } from '@playwright/test';
import { existsSync } from 'node:fs';

import { loadRuntimeEnv } from './src/support/env';

// The stack launcher and the test runner must agree on ports, database and
// mailbox. Read the same env file the server was started with.
loadRuntimeEnv();

// Sandbox images keep their browser cache outside the workspace snapshot, so
// resolve it before any browser is launched.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/home/user/pw-browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/home/user/pw-browsers';
}

/**
 * Real-stack E2E configuration.
 *
 * The suite drives the actual product: a real Chromium page talks to the built
 * React studio, which calls the real Rust API, which writes to a real
 * PostgreSQL database and renders immutable release snapshots through the
 * in-process worker. There is no API stubbing layer.
 *
 * Browser matrix: Chromium is the reference engine for these workflows — they
 * exercise a rich-text canvas (TipTap/ProseMirror), drag-and-drop tree
 * reordering and a push-state SPA — so it is the default project and the one the
 * documented run counts come from. Firefox runs the same suite and is enabled
 * with `E2E_BROWSERS=chromium,firefox` (CI does this on a schedule, not on every
 * commit: each test publishes real releases, so quadrupling the matrix quadruples
 * the runtime for little extra signal). WebKit is opt-in as well and needs its own
 * system libraries, which the minimal image does not ship.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4310';
const isCI = !!process.env.CI;

/** Which browser projects to define. Chromium always; the others on request. */
const wantedBrowsers = (process.env.E2E_BROWSERS ?? (isCI ? 'chromium,firefox' : 'chromium'))
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

const allProjects: Project[] = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
  { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
];

for (const requested of wantedBrowsers) {
  if (!allProjects.some((project) => project.name === requested)) {
    throw new Error(`Unknown browser in E2E_BROWSERS: ${requested}`);
  }
}

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  // Retries exist to surface flaky behaviour in CI diagnostics, never to hide
  // it. A test that only passes on retry is a defect and is reported as one.
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : Number(process.env.E2E_WORKERS ?? 3),
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL,
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',
    locale: 'en-US',
    timezoneId: 'Asia/Bangkok',
    testIdAttribute: 'data-testid',
  },
  projects: allProjects.filter((project) => project.name !== undefined && wantedBrowsers.includes(project.name)),
  // Refuse to run against a half-started environment (see runtime/global-setup.ts).
  globalSetup: './runtime/global-setup.ts',
  metadata: {
    'cms-e2e': {
      // Surfaced in the HTML report so a failing run explains its environment.
      database: process.env.CMS_DATABASE__URL ?? 'postgres://…/cms_e2e',
      mailSink: process.env.E2E_MAIL_DIR ?? '/tmp/cms-e2e-mail',
    },
  },
});