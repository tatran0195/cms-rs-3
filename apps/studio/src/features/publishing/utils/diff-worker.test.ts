import type { BaselinePageItem } from '@cms/sdk';
import { describe, expect, it } from 'vitest';
import { computeChangesSync, diffLinesSync } from './diff-worker';
import { diffWorkerClient } from './diff-worker-client';

describe('Diff Worker & Myers Line-Diff Algorithm', () => {
  const basePageA: BaselinePageItem = {
    id: 'page-1',
    title: 'Getting Started',
    path: 'getting-started',
    slug: 'getting-started',
    content: 'Line 1\nLine 2\nLine 3',
    isPublished: true,
    languageCode: 'en',
    kind: 'PAGE',
  };

  const basePageB: BaselinePageItem = {
    id: 'page-2',
    title: 'Installation',
    path: 'installation',
    slug: 'installation',
    content: 'Install via npm.',
    isPublished: true,
    languageCode: 'en',
    kind: 'PAGE',
  };

  it('computes line-by-line diff between two text documents', () => {
    const oldText = 'First line\nSecond line\nThird line';
    const newText = 'First line\nModified second\nThird line\nFourth line';

    const diff = diffLinesSync(oldText, newText);

    expect(diff.additions).toBe(2); // 'Modified second' and 'Fourth line'
    expect(diff.deletions).toBe(1); // 'Second line'
    expect(diff.lines.some((l) => l.type === 'removed' && l.text === 'Second line')).toBe(true);
    expect(diff.lines.some((l) => l.type === 'added' && l.text === 'Modified second')).toBe(true);
    expect(diff.lines.some((l) => l.type === 'added' && l.text === 'Fourth line')).toBe(true);
    expect(diff.lines.some((l) => l.type === 'unchanged' && l.text === 'First line')).toBe(true);
    expect(diff.truncated).toBe(false);
  });

  it('detects added pages when hasBaseline is true', () => {
    const pageC: BaselinePageItem = {
      id: 'page-3',
      title: 'Configuration',
      path: 'configuration',
      slug: 'configuration',
      content: 'Config options:\n- port\n- host',
      isPublished: true,
      languageCode: 'en',
      kind: 'PAGE',
    };

    const result = computeChangesSync({
      currentPages: [basePageA, pageC],
      baselinePages: [basePageA],
      hasBaseline: true,
    });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.id).toBe('page-3');
    expect(result.changes[0]?.status).toBe('added');
    expect(result.changes[0]?.additions).toBe(3);
    expect(result.changes[0]?.deletions).toBe(0);
  });

  it('detects removed pages when hasBaseline is true', () => {
    const result = computeChangesSync({
      currentPages: [basePageA],
      baselinePages: [basePageA, basePageB],
      hasBaseline: true,
    });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.id).toBe('page-2');
    expect(result.changes[0]?.status).toBe('removed');
    expect(result.changes[0]?.additions).toBe(0);
    expect(result.changes[0]?.deletions).toBe(1);
  });

  it('detects modified pages with line-level diff', () => {
    const modifiedA: BaselinePageItem = {
      ...basePageA,
      content: 'Line 1\nLine 2 updated\nLine 3',
    };

    const result = computeChangesSync({
      currentPages: [modifiedA, basePageB],
      baselinePages: [basePageA, basePageB],
      hasBaseline: true,
    });

    expect(result.changes).toHaveLength(1);
    const change = result.changes[0];
    expect(change?.id).toBe('page-1');
    expect(change?.status).toBe('modified');
    expect(change?.additions).toBe(1);
    expect(change?.deletions).toBe(1);
    expect(change?.lines.some((l) => l.type === 'removed' && l.text === 'Line 2')).toBe(true);
    expect(change?.lines.some((l) => l.type === 'added' && l.text === 'Line 2 updated')).toBe(true);
  });

  it('handles first publish when hasBaseline is false', () => {
    const result = computeChangesSync({
      currentPages: [basePageA, basePageB],
      baselinePages: [],
      hasBaseline: false,
    });

    expect(result.hasBaseline).toBe(false);
    expect(result.changes).toHaveLength(2);
    expect(result.changes.every((c) => c.status === 'added')).toBe(true);
  });

  it('truncates diffs beyond max line limit (1000 lines)', () => {
    const linesOld = Array.from({ length: 1200 }, (_, i) => `Old line ${i}`).join('\n');
    const linesNew = Array.from({ length: 1200 }, (_, i) => `New line ${i}`).join('\n');

    const diff = diffLinesSync(linesOld, linesNew, 1000);
    expect(diff.truncated).toBe(true);
    expect(diff.lines.length).toBeLessThanOrEqual(1000);
  });

  it('diffWorkerClient computes changes transparently via fallback in test environment', async () => {
    const res = await diffWorkerClient.computeChanges({
      currentPages: [basePageA],
      baselinePages: [],
      hasBaseline: false,
    });

    expect(res.changes).toHaveLength(1);
    expect(res.changes[0]?.id).toBe('page-1');
    expect(res.changes[0]?.status).toBe('added');
  });
});
