import type { APIRequestContext } from '@playwright/test';

export interface ForgedResponse {
  status: number;
  body: string;
  json: <T = unknown>() => T;
}

/**
 * A cookie-less HTTP client pointed at the real running stack.
 *
 * Two narrow jobs, both of which a browser UI cannot express on its own:
 *
 *  1. **Stale/forged payload replay** — submit a one-time code that was already
 *     consumed, or an identifier belonging to another tenant, and assert the
 *     backend refuses it. The browser cannot produce these because its own UI
 *     never sends them.
 *  2. **Cross-tenant boundary probing** — confirm that an unauthenticated
 *     request to a protected route is rejected rather than served.
 *
 * It creates no application state: every entity under test is still created by
 * a person clicking through the studio.
 */
export class ForgedApi {
  constructor(private readonly context: APIRequestContext, private readonly baseURL: string) {}

  /** Wrap a fresh, cookie-less request context. */
  static fromContext(context: APIRequestContext, baseURL: string): ForgedApi {
    return new ForgedApi(context, baseURL);
  }

  async request(
    path: string,
    init: { method?: string; data?: unknown; headers?: Record<string, string> } = {},
  ): Promise<ForgedResponse> {
    const context = this.context;
    const method = init.method ?? 'GET';
    const response = await context.fetch(path, {
      method,
      headers:
        init.data === undefined
          ? init.headers
          : { 'Content-Type': 'application/json', ...init.headers },
      data: init.data as never,
    });
    const body = await response.text();
    return { status: response.status(), body, json: <T>() => JSON.parse(body) as T };
  }

  /** The cookies this client holds — must stay empty for it to be meaningful. */
  async cookies(): Promise<string[]> {
    const state = await this.context.storageState();
    return (state.cookies ?? []).map((cookie) => `${cookie.name}=${cookie.value}`);
  }
}
