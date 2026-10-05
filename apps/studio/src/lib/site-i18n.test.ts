import { siteT } from '@cms/i18n/site';
import { describe, expect, it } from 'vitest';

describe('published-site reader localization', () => {
  it('localizes reader controls and MDX defaults for Japanese and Chinese', () => {
    const jaT = siteT('ja-JP');
    expect(jaT('copyCode')).not.toBe('Copy code');
    expect(jaT('toggleTheme')).not.toBe('Toggle theme');

    const zhT = siteT('zh-CN');
    expect(zhT('copyCode')).toBe('复制代码');
    expect(zhT('toggleTheme')).toBe('切换主题');
  });

  it('localizes shipped languages and uses English for unshipped locales', () => {
    expect(siteT('en')('copyCode')).toBe('Copy code');
    expect(siteT('zh-CN')('showProperties')).toBe('显示属性');
    expect(siteT('it')('showProperties')).toBe('Show properties');
    expect(siteT('fr')('showProperties')).toBe('Show properties');
  });
});
