import { getLocale } from '@cms/i18n';
import { CmsClientBuilder } from '@cms/sdk';

const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4310';

/**
 * Singleton typed CMS SDK Client configured for Studio SPA using CmsClientBuilder
 */
export const cmsClient = CmsClientBuilder.create()
  .withBaseUrl(baseOrigin)
  .withLocale(() => {
    try {
      return getLocale();
    } catch {}
  })
  .withCredentials('include')
  .build();
