import { CmsApiError, CmsNetworkError, CmsTimeoutError } from './errors';
import type { ApiResponse } from './types';

export interface HttpClientOptions {
  /**
   * Base URL of the Axum CMS API, e.g. http://localhost:8080 or https://api.cms.company.internal
   */
  baseUrl: string;
  /**
   * Static token or dynamic token getter (e.g. from session or auth store)
   */
  token?: string | (() => string | null | undefined | Promise<string | null | undefined>);
  /**
   * Additional custom headers
   */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
  /**
   * Custom fetch implementation (defaults to globalThis.fetch)
   */
  fetch?: typeof fetch;
  /**
   * Request timeout in milliseconds (default 30,000ms)
   */
  timeoutMs?: number;
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly token?: HttpClientOptions['token'];
  private readonly headers?: HttpClientOptions['headers'];
  private readonly customFetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.headers = options.headers;
    this.customFetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private async resolveToken(): Promise<string | null | undefined> {
    if (!this.token) return undefined;
    if (typeof this.token === 'function') {
      return await this.token();
    }
    return this.token;
  }

  private async resolveHeaders(): Promise<Record<string, string>> {
    if (!this.headers) return {};
    if (typeof this.headers === 'function') {
      return await this.headers();
    }
    return this.headers;
  }

  private buildUrl(path: string, params?: HttpRequestOptions['params']): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);
    if (params) {
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null) {
          url.searchParams.set(key, String(val));
        }
      }
    }
    return url.toString();
  }

  /**
   * Executes an HTTP request and returns the full ApiResponse envelope
   */
  async requestWithMeta<T>(path: string, options: HttpRequestOptions = {}): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, options.params);
    const token = await this.resolveToken();
    const dynamicHeaders = await this.resolveHeaders();

    const requestHeaders: Record<string, string> = {
      'Accept': 'application/json',
      ...dynamicHeaders,
      ...options.headers,
    };

    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }

    let requestBody: string | undefined = undefined;
    if (options.body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let combinedSignal: AbortSignal = controller.signal;
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await this.customFetch(url, {
        method: options.method || 'GET',
        headers: requestHeaders,
        body: requestBody,
        signal: combinedSignal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      if (!response.ok) {
        let code = `HTTP_${response.status}`;
        let message = response.statusText || 'Request failed';
        let details: unknown = undefined;
        let requestId = response.headers.get('x-request-id') || undefined;

        if (isJson) {
          try {
            const errData = await response.json();
            if (errData && typeof errData === 'object') {
              if ('error' in errData && typeof errData.error === 'object' && errData.error !== null) {
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
                requestId = String(errData.requestId);
              }
            }
          } catch {
            // Keep default message/code
          }
        } else {
          try {
            const text = await response.text();
            if (text) message = text;
          } catch {
            // Keep default message
          }
        }

        throw new CmsApiError({
          status: response.status,
          code,
          message,
          details,
          requestId,
        });
      }

      if (response.status === 204) {
        return { data: undefined as unknown as T };
      }

      if (isJson) {
        const json = await response.json();
        // Check if response is wrapped in standard { data: T, meta?: ResponseMeta }
        if (json && typeof json === 'object' && 'data' in json) {
          return json as ApiResponse<T>;
        }
        // Legacy or raw endpoint fallback
        return { data: json as T };
      }

      const text = await response.text();
      return { data: text as unknown as T };
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof CmsApiError) {
        throw err;
      }

      if (err instanceof DOMException && err.name === 'AbortError') {
        if (!options.signal?.aborted) {
          throw new CmsTimeoutError(this.timeoutMs);
        }
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
    return this.request<T>(path, { method: 'POST', body, params });
  }

  put<T>(path: string, body?: unknown, params?: HttpRequestOptions['params']): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body, params });
  }

  patch<T>(path: string, body?: unknown, params?: HttpRequestOptions['params']): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body, params });
  }

  delete<T>(path: string, params?: HttpRequestOptions['params']): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', params });
  }
}
