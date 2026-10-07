import { describe, expect, it } from 'vitest';
import { addonConfigSchemas, parseAddonConfigRecord, projectConfigWithAddons } from './addons';

describe('add-on configuration validation', () => {
  it('accepts bounded http(s) templates with known placeholders', () => {
    expect(addonConfigSchemas['edit-suggestions'].safeParse({ urlTemplate: 'https://github.com/acme/docs/edit/main/{path}' }).success).toBe(true);
    expect(addonConfigSchemas['issue-links'].safeParse({ urlTemplate: 'https://github.com/acme/docs/issues/new?url={url}' }).success).toBe(true);
  });

  it.each(['javascript:alert(1)', 'ftp://example.com/{path}', 'https://user:secret@example.com/{path}', 'https://example.com/{unknown}'])(
    'rejects unsafe or unknown edit URL template %s',
    (urlTemplate) => {
      expect(addonConfigSchemas['edit-suggestions'].safeParse({ urlTemplate }).success).toBe(false);
    },
  );

  it('rejects unmatched and nested braces in every URL-template add-on', () => {
    for (const addonId of ['edit-suggestions', 'issue-links'] as const) {
      for (const urlTemplate of ['https://example.com/{path', 'https://example.com/path}', 'https://example.com/{{path}}']) {
        expect(addonConfigSchemas[addonId].safeParse({ urlTemplate }).success).toBe(false);
      }
    }
  });
});

describe('Project.config compatibility projection', () => {
  it('replaces a malformed root with a bounded safe projection', () => {
    expect(projectConfigWithAddons('malformed', [])).toMatchObject({
      addons: { feedback: true, editSuggestions: true, issueLinks: true },
    });
  });

  it('preserves unrelated sibling sections while replacing owned add-on fields', () => {
    const projected = projectConfigWithAddons(
      {
        search: { mode: 'hybrid' },
        theme: { preset: 'signal' },
        analytics: { provider: 'plausible' },
        addons: { futureField: 'keep' },
      },
      [{ key: 'feedback', enabled: false, config: { placement: 'after-navigation', presentation: 'card' } }],
    );

    expect(projected).toMatchObject({
      search: { mode: 'hybrid' },
      theme: { preset: 'signal' },
      analytics: { provider: 'plausible' },
      addons: {
        futureField: 'keep',
        feedback: false,
        feedbackPlacement: 'after-navigation',
        feedbackPresentation: 'card',
      },
    });
  });

  it('omits absent URL-template fields from the durable JSON projection', () => {
    const projected = projectConfigWithAddons(
      { addons: { editUrl: 'https://stale.example/edit', issueUrl: 'https://stale.example/issue', futureField: 'keep' } },
      [
        { key: 'edit-suggestions', enabled: true, config: {} },
        { key: 'issue-links', enabled: true, config: {} },
      ],
    );
    const addons = parseAddonConfigRecord(projected.addons);

    expect(addons).not.toHaveProperty('editUrl');
    expect(addons).not.toHaveProperty('issueUrl');
    expect(addons).toMatchObject({ editSuggestions: true, issueLinks: true, futureField: 'keep' });
    expect(JSON.parse(JSON.stringify(projected))).toEqual(projected);
  });
});
