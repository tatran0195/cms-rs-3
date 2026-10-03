import { describe, expect, it } from 'vitest';
import { INTERFACE_LOCALES, isRtl, resolveLocale } from './locales';

describe('interface locales', () => {
  it('normalizes BCP-47 variants and supports en, zh-CN, and ja', () => {
    expect(resolveLocale('zh_CN')).toBe('zh-CN');
    expect(resolveLocale('zh-Hans')).toBe('zh-CN');
    expect(resolveLocale('ja-JP')).toBe('ja');
    expect(resolveLocale('en-US')).toBe('en');
    expect(isRtl('en')).toBe(false);
    expect(isRtl('ja')).toBe(false);
    expect(INTERFACE_LOCALES.find(({ code }) => code === 'ja')?.native).toBe('日本語');
    expect(INTERFACE_LOCALES.find(({ code }) => code === 'zh-CN')?.native).toBe('简体中文');
    expect(INTERFACE_LOCALES.find(({ code }) => code === 'en')?.native).toBe('English');
    expect(INTERFACE_LOCALES).toHaveLength(3);
  });
});
