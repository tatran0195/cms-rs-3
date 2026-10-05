import { describe, expect, it } from 'vitest';
import { siteHref, siteLanguageParam } from './site-paths';

describe('siteHref', () => {
  it('prefixes with basePath when provided', () => {
    expect(siteHref('p1', 'guides', { basePath: '' })).toBe('/guides');
    expect(siteHref('p1', 'guides', { basePath: '/sites/p1' })).toBe('/sites/p1/guides');
    expect(siteHref('p1', 'guides', { basePath: '/sites/p1', version: 'v2', lang: 'ja' })).toBe('/sites/p1/v2/guides?lang=ja');
    expect(siteHref('p1', '', { basePath: '' })).toBe('/');
    expect(siteHref('p1', '', { basePath: '/sites/p1' })).toBe('/sites/p1');
  });

  it('handles default studio prefix when basePath is omitted', () => {
    expect(siteHref('p1')).toBe('/sites/p1');
    expect(siteHref('p1', 'intro')).toBe('/sites/p1/intro');
    expect(siteHref('p1', '/guides/intro/')).toBe('/sites/p1/guides/intro');
    expect(siteHref('p1', '')).toBe('/sites/p1');
  });

  it('handles standalone reader when projectId is standalone', () => {
    expect(siteHref('standalone', 'guides')).toBe('/guides');
    expect(siteHref('standalone', '')).toBe('/');
  });

  it.each(['en', 'ja'])('omits the configured default %s when switching languages or following header/version links', (defaultCode) => {
    const lang = siteLanguageParam(defaultCode, defaultCode);
    expect(lang).toBeUndefined();
    for (const basePath of ['', '/sites/p1']) {
      const base = basePath;
      expect(siteHref('p1', 'translated-start', { lang, version: 'v2', basePath })).toBe(`${base}/v2/translated-start`);
      expect(siteHref('p1', '', { lang, version: 'v2', basePath })).toBe(`${base}/v2`);
      expect(siteHref('p1', 'changelog', { lang, basePath })).toBe(`${base}/changelog`);
      expect(siteHref('p1', '/reference?tab=cli#request', { lang, version: 'v2', basePath })).toBe(`${base}/v2/reference?tab=cli#request`);
      expect(siteHref('p1', '/reference?lang=fr', { lang, basePath })).toBe(`${base}/reference?lang=fr`);
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
    expect(siteHref('p1', '/guides/intro?lang=en', { lang: 'ja', basePath: '' })).toBe('/guides/intro?lang=en');
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
});
