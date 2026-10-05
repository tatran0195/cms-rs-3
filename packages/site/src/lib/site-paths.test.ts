import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCustomDomainSite, siteBasePath, siteHref, siteLanguageParam } from './site-paths';

// site-origin reads the custom-domain origin the server entry stamped on the
// request; swap it for a controllable value so both serving modes are covered.
const origin = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('./site-origin', () => ({ customDomainOrigin: () => origin.value }));


afterEach(() => {
  origin.value = undefined;
});

describe('siteBasePath', () => {
  it('hangs app-origin sites off /sites/:projectId and custom domains off the root', () => {
    expect(siteBasePath('p1', false)).toBe('/sites/p1');
    expect(siteBasePath('p1', true)).toBe('');
  });
});

describe('siteHref', () => {
  it.each(['en', 'ja'])('omits the configured default %s when switching languages or following header/version links', (defaultCode) => {
    const lang = siteLanguageParam(defaultCode, defaultCode);
    expect(lang).toBeUndefined();
    for (const customOrigin of [undefined, 'https://docs.acme.com']) {
      origin.value = customOrigin;
      const base = customOrigin ? '' : '/sites/p1';
      expect(siteHref('p1', 'translated-start', { lang, version: 'v2' })).toBe(`${base}/v2/translated-start`);
      expect(siteHref('p1', '', { lang, version: 'v2' })).toBe(`${base}/v2`);
      expect(siteHref('p1', 'changelog', { lang })).toBe(`${base}/changelog`);
      expect(siteHref('p1', '/reference?tab=cli#request', { lang, version: 'v2' })).toBe(`${base}/v2/reference?tab=cli#request`);
      expect(siteHref('p1', '/reference?lang=fr', { lang })).toBe(`${base}/reference?lang=fr`);
    }
  });

  it('retains non-default and unknown-default language selections', () => {
    expect(siteLanguageParam('ja', 'en')).toBe('ja');
    expect(siteLanguageParam('en')).toBe('en');
    expect(siteHref('p1', 'v2/start', { lang: siteLanguageParam('ja', 'en') })).toBe('/sites/p1/v2/start?lang=ja');
  });
  it('preserves an explicit target language on cross-language links', () => {
    expect(siteHref('p1', '/guides/intro?lang=ja&tab=cli#install', { lang: 'en', version: 'v2' })).toBe(
      '/sites/p1/v2/guides/intro?lang=ja&tab=cli#install',
    );
    origin.value = 'https://docs.acme.com';
    expect(siteHref('p1', '/guides/intro?lang=en', { lang: 'ja' })).toBe('/guides/intro?lang=en');
  });

  it('builds app-origin hrefs with the language and version carried along', () => {
    expect(siteHref('p1')).toBe('/sites/p1');
    expect(siteHref('p1', '/guides/intro/')).toBe('/sites/p1/guides/intro');
    expect(siteHref('p1', 'guides/intro', { lang: 'he' })).toBe('/sites/p1/guides/intro?lang=he');
    expect(siteHref('p1', 'guides/intro', { lang: 'he', version: 'v2' })).toBe('/sites/p1/v2/guides/intro?lang=he');
    expect(siteHref('p1', '', { version: 'v2' })).toBe('/sites/p1/v2');
  });

  it('percent-encodes non-ASCII path segments exactly once', () => {
    expect(siteHref('p1', 'מדריכים/אימות', { lang: 'he' })).toBe(
      '/sites/p1/%D7%9E%D7%93%D7%A8%D7%99%D7%9B%D7%99%D7%9D/%D7%90%D7%99%D7%9E%D7%95%D7%AA?lang=he',
    );
    // An authored link that is already encoded is not encoded a second time.
    expect(siteHref('p1', '/%D7%90%D7%99%D7%9E%D7%95%D7%AA', { lang: 'he' })).toBe(
      '/sites/p1/%D7%90%D7%99%D7%9E%D7%95%D7%AA?lang=he',
    );
    expect(siteHref('p1', 'api-גישה', { version: 'v2' })).toBe('/sites/p1/v2/api-%D7%92%D7%99%D7%A9%D7%94');
  });

  it('keeps authored anchors and query strings outside the encoded pathname', () => {
    expect(siteHref('p1', '/guides/intro#setup', { lang: 'he' })).toBe('/sites/p1/guides/intro?lang=he#setup');
    expect(siteHref('p1', '/אימות#טוקנים')).toBe('/sites/p1/%D7%90%D7%99%D7%9E%D7%95%D7%AA#טוקנים');
    expect(siteHref('p1', '/guides?tab=cli', { lang: 'he' })).toBe('/sites/p1/guides?tab=cli&lang=he');
    expect(siteHref('p1', '/guides?tab=cli')).toBe('/sites/p1/guides?tab=cli');
  });

  it('uses the domain root when the request arrived on a custom domain', () => {
    origin.value = 'https://docs.acme.com';
    expect(isCustomDomainSite('p1')).toBe(true);
    expect(siteHref('p1')).toBe('/');
    expect(siteHref('p1', 'guides/intro', { lang: 'he' })).toBe('/guides/intro?lang=he');
  });

  it('treats a server request without a stamped origin as app-origin serving', () => {
    expect(isCustomDomainSite('p1')).toBe(false);
    expect(siteHref('p1', 'guides')).toBe('/sites/p1/guides');
  });
});
