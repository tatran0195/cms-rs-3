import { useDomains, useProject } from '@cms/sdk/react';
import { env } from '@/env';

const siteBaseDomain = () => env.VITE_SITE_BASE_DOMAIN?.replace(/^\*\./, '').replace(/\.$/, '') || undefined;
const siteUrl = (domain: string | null, projectId: string) => (domain ? `https://${domain}` : `/sites/${projectId}`);

export function useLiveSiteUrl(projectId: string) {
  const { data: project } = useProject(projectId);
  const { data: domains } = useDomains(projectId);

  const primaryDomain = domains?.find((domain) => domain.isPrimary && domain.verified) ?? domains?.find((domain) => domain.verified);
  const baseDomain = siteBaseDomain();
  const liveDomain = primaryDomain?.domain ?? (project && baseDomain ? `${project.slug}.${baseDomain}` : null);
  const liveHref = siteUrl(liveDomain, projectId);

  return {
    liveHref,
    liveDomain,
    isReady: Boolean(project),
  };
}
