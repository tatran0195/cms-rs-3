import { normalizeRedirectPath } from '@cms/shared/redirects';

/** Build the browser-visible Location for one validated internal redirect.
 * Configured query/fragment values are retained. The current locale is carried
 * only when the destination did not deliberately choose another locale. */
export function buildSiteRedirectHref(input: {
  projectId: string;
  target: string;
  lang?: string;
  basePath?: string;
  /** @deprecated use basePath */
  customDomain?: boolean;
}): string {
  const targetUrl = new URL(input.target, 'https://redirect.cms.invalid');
  const target = normalizeRedirectPath(targetUrl.pathname);
  if (input.lang && !targetUrl.searchParams.has('lang')) {
    targetUrl.searchParams.set('lang', input.lang);
  }
  const suffix = `${targetUrl.search}${targetUrl.hash}`;
  const prefix =
    input.basePath !== undefined
      ? input.basePath
      : input.customDomain
        ? ''
        : input.projectId && input.projectId !== 'standalone'
          ? `/sites/${input.projectId}`
          : '';

  const href = `${prefix}${target ? `/${target}` : ''}` || '/';
  return `${href}${suffix}`;
}
