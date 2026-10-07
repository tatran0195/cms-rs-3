import { getLocale, REQUEST_LOCALE_HEADER } from '@cms/i18n';
import { createCmsClient } from '@cms/sdk';

const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4310';

/**
 * Singleton typed CMS SDK Client configured for Studio SPA
 */
export const cmsClient = createCmsClient({
  baseUrl: baseOrigin,
  headers: () => {
    const headers: Record<string, string> = {};
    try {
      const locale = getLocale();
      if (locale) {
        headers[REQUEST_LOCALE_HEADER] = locale;
      }
    } catch {
      // Locale might not be loaded yet
    }
    return headers;
  },
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      credentials: 'include',
    }),
});
