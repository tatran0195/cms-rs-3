import { normalizeRedirectPath, resolveRedirectTarget } from '@cms/validators/redirects';
import { redirect } from '@tanstack/react-router';
import { buildSiteRedirectHref } from './site-redirect-href';

/**
 * Honor a configured `config.redirects` entry for `path`. Consulted only when a
 * page fails to resolve (404), so old/renamed URLs issue a real 308 to their new
 * home instead of dead-ending — preserving inbound links and SEO equity.
 */
export async function redirectIfConfigured(
  projectId: string,
  path: string,
  lang?: string,
  fetchSite?: (projectId: string, lang?: string) => Promise<{ project: { config: unknown } } | null>,
  basePath?: string,
): Promise<void> {
  let from: string;
  try {
    from = normalizeRedirectPath(path);
  } catch {
    return;
  }
  let shell: { project: { config: unknown } } | null = null;
  if (fetchSite) {
    shell = await fetchSite(projectId, lang).catch(() => null);
  } else {
    try {
      const res = await fetch(`/api/public/sites/${projectId}${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`);
      if (res.ok) {
        shell = await res.json();
      }
    } catch {
      // ignore
    }
  }
  if (!shell) {
    return;
  }
  const storedRedirects = (shell.project.config as { redirects?: unknown } | null)?.redirects;
  const redirects = Array.isArray(storedRedirects) ? storedRedirects : [];
  const validRedirects = redirects.filter(
    (rule): rule is { from: string; to: string } => typeof rule?.from === 'string' && typeof rule?.to === 'string',
  );
  const to = resolveRedirectTarget(validRedirects, from);
  if (!to) {
    return;
  }
  if (/^https?:\/\//i.test(to)) {
    throw redirect({ href: to, statusCode: 308 });
  }
  let href: string;
  try {
    href = buildSiteRedirectHref({ projectId, target: to, lang, basePath });
  } catch {
    return;
  }
  throw redirect({ href, statusCode: 308 });
}
