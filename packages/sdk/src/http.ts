import ky, {
  type KyInstance,
  type Options as KyOptions,
  HTTPError,
  TimeoutError,
  isHTTPError,
} from 'ky';
import { CmsApiError, CmsNetworkError, CmsTimeoutError } from './errors';
import type { ApiResponse } from './types';

export interface HttpClientOptions {
  /**
   * Base URL of the Axum CMS API, e.g. http://localhost:8080 or https://api.cms.company.internal
   */
  baseUrl?: string;
  /**
   * Static token or dynamic token getter (e.g. from session or auth store)
   */
  token?: string | (() => string | null | undefined | Promise<string | null | undefined>);
  /**
   * Additional custom headers or dynamic headers getter
   */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  /**
   * Built-in retry policy configuration from Ky.
   * Defaults to: 2 retries on 408, 413, 429, 500, 502, 503, 504 for idempotent methods.
   * Pass `0` or `{ limit: 0 }` to disable.
   */
  retry?: KyOptions['retry'];
  /**
   * Request timeout in milliseconds (default 30,000ms). Pass `false` to disable.
   */
  timeout?: number | false;
  /**
   * Custom fetch implementation (defaults to globalThis.fetch)
   */
  fetch?: typeof fetch;
  /**
   * Optional custom Ky hooks to extend request/response lifecycle
   */
  hooks?: KyOptions['hooks'];
  /**
   * Additional Ky options to pass directly to ky.create
   */
  kyOptions?: Omit<KyOptions, 'prefix' | 'headers' | 'hooks' | 'retry' | 'timeout' | 'fetch'>;
}

export type HttpRequestOptions = Omit<KyOptions, 'json'> & {
  json?: unknown;
  body?: unknown;
  params?: KyOptions['searchParams'];
};

export class HttpClient {
  /**
   * The underlying KyInstance exposing the full power of Ky (streaming, .blob(), etc.)
   */
  readonly ky: KyInstance;

  readonly options: HttpClientOptions;
  private readonly baseUrl: string;
  private readonly token?: HttpClientOptions['token'];
  private readonly dynamicHeaders?: HttpClientOptions['headers'];
  private readonly timeout: number | false;

  constructor(options: HttpClientOptions = {}) {
    this.options = options;
    const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    this.baseUrl = (options.baseUrl ?? defaultOrigin).replace(/\/+$/, '');
    this.token = options.token;
    this.dynamicHeaders = options.headers;
    this.timeout = options.timeout ?? 30_000;

    const defaultRetry: KyOptions['retry'] = options.retry ?? {
      limit: 2,
      methods: ['get', 'put', 'delete', 'head', 'options'],
      statusCodes: [408, 413, 429, 500, 502, 503, 504],
    };

    const staticHeaders: HeadersInit =
      typeof options.headers === 'function' ? {} : options.headers ?? {};

    this.ky = ky.create({
      prefix: this.baseUrl,
      headers: {
        Accept: 'application/json',
        ...staticHeaders,
      },
      timeout: this.timeout,
      retry: defaultRetry,
      fetch: options.fetch,
      ...options.kyOptions,
      hooks: {
        beforeRequest: [
          async ({ request }) => {
            if (this.token) {
              const resolvedToken =
                typeof this.token === 'function' ? await this.token() : this.token;
              if (resolvedToken && !request.headers.has('Authorization')) {
                request.headers.set('Authorization', `Bearer ${resolvedToken}`);
              }
            }

            if (this.dynamicHeaders && typeof this.dynamicHeaders === 'function') {
              const resolvedHeaders = await this.dynamicHeaders();
              if (resolvedHeaders) {
                new Headers(resolvedHeaders).forEach((value, key) => {
                  if (!request.headers.has(key)) {
                    request.headers.set(key, value);
                  }
                });
              }
            }
          },
          ...(options.hooks?.beforeRequest ?? []),
        ],
        beforeError: [
          async ({ error, request }) => {
            if (!isHTTPError(error)) {
              return error;
            }

            const response = error.response;
            let code = `HTTP_${response.status}`;
            let message = response.statusText || 'Request failed';
            let details: unknown = undefined;
            let requestId = response.headers.get('x-request-id') || undefined;

            let errData = error.data;
            if (!errData && response) {
              try {
                errData = await response.clone().json();
              } catch {
                // Ignore non-json or unreadable body
              }
            }
            if (errData && typeof errData === 'object') {
              if (
                'error' in errData &&
                typeof errData.error === 'object' &&
                errData.error !== null
              ) {
                const sub = errData.error as Record<string, unknown>;
                code = String(sub.code || code);
                message = String(sub.message || message);
                details = sub.details;
              } else if ('message' in errData) {
                const errObj = errData as Record<string, unknown>;
                message = String(errObj.message || message);
                code = String(errObj.code || code);
                details = errObj.details;
              }
              if ('requestId' in errData && !requestId) {
                requestId = String((errData as Record<string, unknown>).requestId);
              }
            }

            return new CmsApiError({
              status: response.status,
              code,
              message,
              details,
              requestId,
              response,
              request,
            });
          },
          ...(options.hooks?.beforeError ?? []),
        ],
        beforeRetry: options.hooks?.beforeRetry,
        afterResponse: options.hooks?.afterResponse,
      },
    });
  }

  /**
   * Direct access to the raw underlying Ky instance
   */
  get raw(): KyInstance {
    return this.ky;
  }

  /**
   * Returns a new HttpClient extending the current instance with additional Ky options
   */
  extend(overrides: Partial<HttpClientOptions>): HttpClient {
    const mergedHeaders: HttpClientOptions['headers'] =
      typeof this.options.headers === 'function' || typeof overrides.headers === 'function'
        ? (overrides.headers ?? this.options.headers)
        : overrides.headers
          ? {
              ...(typeof this.options.headers === 'object' ? this.options.headers : {}),
              ...(typeof overrides.headers === 'object' ? overrides.headers : {}),
            }
          : this.options.headers;

    return new HttpClient({
      ...this.options,
      ...overrides,
      baseUrl: overrides.baseUrl ?? this.options.baseUrl,
      token: overrides.token !== undefined ? overrides.token : this.options.token,
      headers: mergedHeaders,
      timeout: overrides.timeout !== undefined ? overrides.timeout : this.options.timeout,
      retry: overrides.retry !== undefined ? overrides.retry : this.options.retry,
      fetch: overrides.fetch ?? this.options.fetch,
      hooks: {
        beforeRequest: [
          ...(this.options.hooks?.beforeRequest ?? []),
          ...(overrides.hooks?.beforeRequest ?? []),
        ],
        beforeRetry: [
          ...(this.options.hooks?.beforeRetry ?? []),
          ...(overrides.hooks?.beforeRetry ?? []),
        ],
        afterResponse: [
          ...(this.options.hooks?.afterResponse ?? []),
          ...(overrides.hooks?.afterResponse ?? []),
        ],
        beforeError: [
          ...(this.options.hooks?.beforeError ?? []),
          ...(overrides.hooks?.beforeError ?? []),
        ],
      },
      kyOptions: {
        ...this.options.kyOptions,
        ...overrides.kyOptions,
      },
    });
  }

  /**
   * Executes an HTTP request and returns the full ApiResponse envelope
   */
  async requestWithMeta<T>(
    path: string,
    options: HttpRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    try {
      const searchParams = options.searchParams ?? options.params;
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      const jsonBody = options.json ?? options.body;

      const kyOptions: KyOptions = {
        ...options,
        searchParams,
        json: jsonBody !== undefined ? jsonBody : undefined,
      };

      const response = await this.ky(cleanPath, kyOptions);

      if (response.status === 204) {
        return { data: undefined as unknown as T };
      }

      const json = await response.json();
      if (json && typeof json === 'object' && 'data' in json) {
        return json as ApiResponse<T>;
      }
      return { data: json as T };
    } catch (err) {
      if (err instanceof CmsApiError) {
        throw err;
      }

      if (err instanceof TimeoutError) {
        throw new CmsTimeoutError(
          this.timeout === false ? 0 : this.timeout ?? 30_000
        );
      }

      if (err instanceof HTTPError) {
        throw new CmsApiError({
          status: err.response.status,
          code: `HTTP_${err.response.status}`,
          message: err.message,
          response: err.response,
          request: err.request,
        });
      }

      throw new CmsNetworkError(
        err instanceof Error ? err.message : 'Network request failed',
        err
      );
    }
  }

  /**
   * Executes an HTTP request and unwraps data directly from the unified ApiResponse envelope
   */
  async request<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
    const envelope = await this.requestWithMeta<T>(path, options);
    return envelope.data;
  }

  get<T>(path: string, params?: HttpRequestOptions['params']): Promise<T> {
    return this.request<T>(path, { method: 'GET', params });
  }

  post<T>(path: string, body?: unknown, params?: HttpRequestOptions['params']): Promise<T> {
    return this.request<T>(path, { method: 'POST', json: body, params });
  }

  put<T>(path: string, body?: unknown, params?: HttpRequestOptions['params']): Promise<T> {
    return this.request<T>(path, { method: 'PUT', json: body, params });
  }

  patch<T>(path: string, body?: unknown, params?: HttpRequestOptions['params']): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', json: body, params });
  }

  delete<T>(path: string, params?: HttpRequestOptions['params']): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', params });
  }
}
