import { describe, expect, it } from 'vitest';
import { buildSiteRedirectHref } from './site-redirect-href';

describe('buildSiteRedirectHref', () => {
  it('preserves configured query and fragment under the app base path', () => {
    expect(buildSiteRedirectHref({ projectId: 'project-1', target: '/guide?campaign=launch#install', lang: 'he', basePath: '/sites/project-1' })).toBe(
      '/sites/project-1/guide?campaign=launch&lang=he#install',
    );
  });

  it('keeps an explicitly selected locale and uses the root when basePath is empty', () => {
    expect(buildSiteRedirectHref({ projectId: 'project-1', target: '/guide?lang=en#top', lang: 'he', basePath: '' })).toBe(
      '/guide?lang=en#top',
    );
  });

  it('normalizes trailing slashes and handles the site root', () => {
    expect(buildSiteRedirectHref({ projectId: 'project-1', target: '/guide///', basePath: '/sites/project-1' })).toBe('/sites/project-1/guide');
    expect(buildSiteRedirectHref({ projectId: 'project-1', target: '/', basePath: '/sites/project-1' })).toBe('/sites/project-1');
  });

  it('handles default studio prefix when basePath is omitted', () => {
    expect(buildSiteRedirectHref({ projectId: 'project-1', target: '/guide' })).toBe('/sites/project-1/guide');
    expect(buildSiteRedirectHref({ projectId: 'standalone', target: '/guide' })).toBe('/guide');
  });
});
