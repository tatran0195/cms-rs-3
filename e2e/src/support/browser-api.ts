import type { Page } from '@playwright/test';

export interface ApiResult {
  status: number;
  body: string;
}

/**
 * Issues a request from *inside* the authenticated browser context.
 *
 * This is the product's own `fetch` with the live session cookie, so it talks to
 * the real backend. It is used for two legitimate purposes only:
 *
 *  1. independent verification of what the UI just did (a different read path
 *     than the UI's own response handling), and
 *  2. security-boundary scenarios — stale or forged payloads a UI cannot
 *     produce on its own (cross-language parenting, an id from another project,
 *     a double-submitted mutation).
 *
 * It is never used to set up state the UI is supposed to create.
 */
export class BrowserApi {
  constructor(private readonly page: Page) {}

  async request(method: string, path: string, body?: unknown): Promise<ApiResult> {
    return this.page.evaluate(
      async ({ method: verb, path: url, body: payload }) => {
        const response = await fetch(url, {
          method: verb,
          credentials: 'include',
          headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
          body: payload === undefined ? undefined : JSON.stringify(payload),
        });
        return { status: response.status, body: await response.text() };
      },
      { method, path, body },
    );
  }

  async json<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const result = await this.request(method, path, body);
    let data: T;
    try {
      data = JSON.parse(result.body) as T;
    } catch {
      data = undefined as unknown as T;
    }
    return { status: result.status, data };
  }

  get<T = unknown>(path: string) {
    return this.json<T>('GET', path);
  }

  post<T = unknown>(path: string, body?: unknown) {
    return this.json<T>('POST', path, body);
  }

  patch<T = unknown>(path: string, body?: unknown) {
    return this.json<T>('PATCH', path, body);
  }

  delete<T = unknown>(path: string, body?: unknown) {
    return this.json<T>('DELETE', path, body);
  }
}