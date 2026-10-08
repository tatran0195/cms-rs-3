import type { ConsoleMessage, Page, Request, Response } from '@playwright/test';

export type DiagnosticSeverity = 'error' | 'warning';

export interface Diagnostics {
  consoleErrors: string[];
  pageErrors: string[];
  httpFailures: string[];
  serverErrors: string[];
  /** Application noise the test explicitly declared as expected. */
  expected: Array<string | RegExp>;
  /** Application noise the test observed and accepted for this test only. */
  tolerated: Array<string | RegExp>;
  assertClean(options?: { label?: string }): void;
  /** Mark a pattern as an expected business error (e.g. a deliberate 409). */
  expectFailure(pattern: string | RegExp): void;
  /** Allow a known-harmless application behaviour without hiding real errors. */
  tolerate(pattern: string | RegExp): void;
}

/**
 * Collects browser-console, uncaught-exception and network diagnostics so a
 * green assertion is never hiding a broken page.
 *
 * "Expected business error" and "unexpected application failure" are kept
 * apart deliberately: a test that triggers a validation failure declares it
 * through `expectFailure`, while anything else — a 500, an uncaught exception,
 * a failed script — fails the test.
 */
export function attachDiagnostics(page: Page): Diagnostics {
  const diagnostics: Diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    httpFailures: [],
    serverErrors: [],
    expected: [],
    tolerated: [],
    assertClean(options = {}) {
      const label = options.label ? `${options.label}: ` : '';
      const unexpectedConsole = diagnostics.consoleErrors.filter((entry) => !matchesAny(entry, diagnostics.expected));
      const unexpectedNetwork = diagnostics.httpFailures.filter(
        (entry) => !matchesAny(entry, diagnostics.expected) && !matchesAny(entry, diagnostics.tolerated),
      );
      const unexpectedServer = diagnostics.serverErrors.filter(
        (entry) => !matchesAny(entry, diagnostics.expected) && !matchesAny(entry, diagnostics.tolerated),
      );
      const unexpectedPages = diagnostics.pageErrors.filter(
        (entry) => !matchesAny(entry, diagnostics.expected) && !matchesAny(entry, diagnostics.tolerated),
      );

      if (unexpectedConsole.length || unexpectedNetwork.length || unexpectedServer.length || unexpectedPages.length) {
        throw new Error(
          [
            `${label}unexpected application diagnostics:`,
            ...unexpectedPages.map((entry) => `  • pageerror: ${entry}`),
            ...unexpectedConsole.map((entry) => `  • console.error: ${entry}`),
            ...unexpectedServer.map((entry) => `  • ${entry}`),
            ...unexpectedNetwork.map((entry) => `  • ${entry}`),
          ].join('\n'),
        );
      }
    },
    expectFailure(pattern) {
      diagnostics.expected.push(pattern);
    },
    tolerate(pattern) {
      diagnostics.tolerated.push(pattern);
    },
  };

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      diagnostics.consoleErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error.message);
  });

  page.on('requestfailed', (request: Request) => {
    const failure = request.failure();
    // Aborted navigations and cancelled preflights are browser behaviour, not
    // application faults.
    if (failure && !/ERR_ABORTED/.test(failure.errorText)) {
      diagnostics.httpFailures.push(`request failed ${request.method()} ${request.url()} — ${failure.errorText}`);
    }
  });

  page.on('response', (response: Response) => {
    const status = response.status();
    if (status >= 500) {
      diagnostics.serverErrors.push(`HTTP ${status} ${response.request().method()} ${response.url()}`);
    }
    if (status >= 400 && status < 500) {
      diagnostics.httpFailures.push(`HTTP ${status} ${response.request().method()} ${response.url()}`);
    }
  });

  return diagnostics;
}

/**
 * Match a diagnostic entry against the patterns a test declared.
 *
 * A `RegExp` is used as-is. A plain string is treated as a literal first and
 * only then as a regex source, so a test writing 'HTTP 429' never has to think
 * about escaping — and, just as importantly, `/429/` is never mistaken for the
 * literal text "/429/".
 */
function matchesAny(entry: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some((pattern) => {
    if (pattern instanceof RegExp) {
      return new RegExp(pattern.source, pattern.flags).test(entry);
    }
    if (entry.includes(pattern)) return true;
    try {
      return new RegExp(pattern).test(entry);
    } catch {
      return false;
    }
  });
}