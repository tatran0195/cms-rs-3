import { CmsClient, type CmsClientOptions } from './client';

export class CmsClientBuilder {
  private options: CmsClientOptions = {};

  static create(): CmsClientBuilder {
    return new CmsClientBuilder();
  }

  withBaseUrl(baseUrl: string): this {
    this.options.baseUrl = baseUrl;
    return this;
  }

  withHeaders(
    headers: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  ): this {
    this.options.headers = headers;
    return this;
  }

  withLocale(getLocaleFn: () => string | undefined): this {
    const existingHeaders = this.options.headers;
    this.options.headers = async () => {
      const base =
        typeof existingHeaders === 'function'
          ? await existingHeaders()
          : existingHeaders || {};
      const locale = getLocaleFn();
      if (locale) {
        return { ...base, 'x-cms-locale': locale };
      }
      return base;
    };
    return this;
  }

  withCredentials(credentials: RequestCredentials): this {
    const existingFetch = this.options.fetch;
    this.options.fetch = (input, init) => {
      const customInit = { ...init, credentials };
      return existingFetch ? existingFetch(input, customInit) : fetch(input, customInit);
    };
    return this;
  }

  withTimeout(timeoutMs: number): this {
    this.options.timeout = timeoutMs;
    return this;
  }

  withRetry(retryOptions: { limit?: number; statusCodes?: number[] }): this {
    this.options.retry = retryOptions;
    return this;
  }

  withCustomFetch(customFetch: typeof fetch): this {
    this.options.fetch = customFetch;
    return this;
  }

  withFetch(customFetch: typeof fetch): this {
    return this.withCustomFetch(customFetch);
  }

  build(): CmsClient {
    return new CmsClient(this.options);
  }
}
