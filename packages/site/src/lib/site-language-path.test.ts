import { describe, expect, it } from 'vitest';
import { matchSiteLanguage, resolveLanguagePathRedirect } from './site-language-path';

const languages = [
  { code: 'en', isDefault: true },
  { code: 'he', isDefault: false },
];
const HEBREW_SLUG = 'מדריך-התחלה';
const ENCODED_HEBREW_SLUG = encodeURIComponent(HEBREW_SLUG);

const resolve = (splat: string, overrides: Partial<Parameters<typeof resolveLanguagePathRedirect>[0]> = {}) =>
  resolveLanguagePathRedirect({ splat, languages, projectId: 'p1', isCustomDomain: false, ...overrides });

describe('matchSiteLanguage', () => {
  it('matches a site language code case-insensitively', () => {
    expect(matchSiteLanguage('he', languages)?.code).toBe('he');
    expect(matchSiteLanguage('HE', languages)?.code).toBe('he');
    expect(matchSiteLanguage('fr', languages)).toBeUndefined();
    expect(matchSiteLanguage('', languages)).toBeUndefined();
  });

  it('accepts the base code of a regional language and prefers an exact match', () => {
    const regional = [
      { code: 'en-US', isDefault: true },
      { code: 'he-IL', isDefault: false },
    ];
    expect(matchSiteLanguage('he', regional)?.code).toBe('he-IL');
    expect(matchSiteLanguage('he-il', regional)?.code).toBe('he-IL');
    expect(matchSiteLanguage('en', regional)?.code).toBe('en-US');

    const both = [
      { code: 'he-IL', isDefault: false },
      { code: 'he', isDefault: false },
    ];
    expect(matchSiteLanguage('he', both)?.code).toBe('he');
    expect(matchSiteLanguage('he-IL', both)?.code).toBe('he-IL');
  });
});

describe('resolveLanguagePathRedirect', () => {
  it('sends the language root to the site root with ?lang', () => {
    expect(resolve('he')).toBe('/sites/p1?lang=he');
    expect(resolve('/he/')).toBe('/sites/p1?lang=he');
  });

  it('keeps the rest of the path under the language prefix', () => {
    expect(resolve('he/guides/intro')).toBe('/sites/p1/guides/intro?lang=he');
  });

  it('drops the prefix and the ?lang param for the default language', () => {
    expect(resolve('en')).toBe('/sites/p1');
    expect(resolve('en/guides/intro')).toBe('/sites/p1/guides/intro');
    expect(resolve('en', { search: '?lang=he&ref=nav' })).toBe('/sites/p1?ref=nav');
  });

  it('returns null when the first segment is not a site language', () => {
    expect(resolve('')).toBeNull();
    expect(resolve('guides/he')).toBeNull();
    expect(resolve('fr')).toBeNull();
    expect(resolve('he', { languages: [] })).toBeNull();
  });

  it('produces one valid href for encoded and decoded RTL slugs', () => {
    const expected = `/sites/p1/${ENCODED_HEBREW_SLUG}?lang=he`;
    expect(resolve(`he/${ENCODED_HEBREW_SLUG}`)).toBe(expected);
    expect(resolve(`he/${HEBREW_SLUG}`)).toBe(expected);
  });

  it('preserves other search params and lets the path language override ?lang', () => {
    expect(resolve('he', { search: '?lang=en&version=2' })).toBe('/sites/p1?lang=he&version=2');
    expect(resolve('he/guides', { search: 'ref=nav' })).toBe('/sites/p1/guides?ref=nav&lang=he');
  });

  it('uses the domain root on a custom domain', () => {
    expect(resolve('he', { isCustomDomain: true })).toBe('/?lang=he');
    expect(resolve('he/guides/intro', { isCustomDomain: true })).toBe('/guides/intro?lang=he');
    expect(resolve('en', { isCustomDomain: true })).toBe('/');
    expect(resolve('en/guides', { isCustomDomain: true })).toBe('/guides');
  });

  it('redirects with the site language code, not the typed segment', () => {
    const regional = [
      { code: 'en-US', isDefault: true },
      { code: 'he-IL', isDefault: false },
    ];
    expect(resolve('HE/guides', { languages: regional })).toBe('/sites/p1/guides?lang=he-IL');
    expect(resolve('en/guides', { languages: regional })).toBe('/sites/p1/guides');
  });
});
