/**
 * Dedicated Web Worker for offloading change detection and line diffing
 * from the main UI thread.
 */

import type { BaselinePageItem, DeploymentDiffLine, PendingChange, PendingChangesResponse } from '@cms/sdk';

export interface ComputeChangesPayload {
  currentPages: BaselinePageItem[];
  baselinePages: BaselinePageItem[];
  hasBaseline: boolean;
  lastVersion?: number;
}

export interface DiffWorkerRequest {
  id: string;
  type: 'compute-changes';
  payload: ComputeChangesPayload;
}

export interface DiffWorkerResponse {
  id: string;
  type: string;
  result?: PendingChangesResponse;
  error?: string;
}

export interface DiffResult {
  lines: DeploymentDiffLine[];
  additions: number;
  deletions: number;
  truncated: boolean;
}

/**
 * Computes line-by-line diff between two text documents with common prefix/suffix
 * optimization and DP longest common subsequence backtracking.
 */
export function diffLinesSync(oldText: string, newText: string, maxLines = 1000): DiffResult {
  const oldLines = oldText ? oldText.split(/\r?\n/) : [];
  const newLines = newText ? newText.split(/\r?\n/) : [];

  const aLen = oldLines.length;
  const bLen = newLines.length;

  // Shortcut 1: Both empty
  if (aLen === 0 && bLen === 0) {
    return { lines: [], additions: 0, deletions: 0, truncated: false };
  }

  // Shortcut 2: Completely new file (additions only)
  if (aLen === 0) {
    const lines: DeploymentDiffLine[] = [];
    let truncated = false;
    for (let i = 0; i < bLen; i++) {
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
      lines.push({
        type: 'added',
        text: newLines[i] ?? '',
        oldLine: null,
        newLine: i + 1,
      });
    }
    return { lines, additions: bLen, deletions: 0, truncated };
  }

  // Shortcut 3: Completely deleted file (deletions only)
  if (bLen === 0) {
    const lines: DeploymentDiffLine[] = [];
    let truncated = false;
    for (let i = 0; i < aLen; i++) {
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
      lines.push({
        type: 'removed',
        text: oldLines[i] ?? '',
        oldLine: i + 1,
        newLine: null,
      });
    }
    return { lines, additions: 0, deletions: aLen, truncated };
  }

  // Common prefix optimization
  let prefixCount = 0;
  while (prefixCount < aLen && prefixCount < bLen && oldLines[prefixCount] === newLines[prefixCount]) {
    prefixCount++;
  }

  // Common suffix optimization
  let suffixCount = 0;
  while (
    suffixCount < aLen - prefixCount &&
    suffixCount < bLen - prefixCount &&
    oldLines[aLen - 1 - suffixCount] === newLines[bLen - 1 - suffixCount]
  ) {
    suffixCount++;
  }

  const midA = oldLines.slice(prefixCount, aLen - suffixCount);
  const midB = newLines.slice(prefixCount, bLen - suffixCount);

  // Compute LCS on middle section
  const m = midA.length;
  const n = midB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (midA[i - 1] === midB[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack middle
  const midDiffs: Array<{ type: 'added' | 'removed' | 'unchanged'; text: string }> = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && midA[i - 1] === midB[j - 1]) {
      midDiffs.push({ type: 'unchanged', text: midA[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      midDiffs.push({ type: 'added', text: midB[j - 1]! });
      j--;
    } else if (i > 0) {
      midDiffs.push({ type: 'removed', text: midA[i - 1]! });
      i--;
    }
  }
  midDiffs.reverse();

  // Combine prefix, middle, suffix
  const allEvents: Array<{ type: 'added' | 'removed' | 'unchanged'; text: string }> = [];
  for (let p = 0; p < prefixCount; p++) {
    allEvents.push({ type: 'unchanged', text: oldLines[p]! });
  }
  for (const event of midDiffs) {
    allEvents.push(event);
  }
  for (let s = aLen - suffixCount; s < aLen; s++) {
    allEvents.push({ type: 'unchanged', text: oldLines[s]! });
  }

  // Number lines and count additions/deletions
  let additions = 0;
  let deletions = 0;
  let currentOld = 0;
  let currentNew = 0;
  const resultLines: DeploymentDiffLine[] = [];
  let truncated = false;

  for (const item of allEvents) {
    if (item.type === 'added') {
      additions++;
      currentNew++;
      if (resultLines.length < maxLines) {
        resultLines.push({
          type: 'added',
          text: item.text,
          oldLine: null,
          newLine: currentNew,
        });
      } else {
        truncated = true;
      }
    } else if (item.type === 'removed') {
      deletions++;
      currentOld++;
      if (resultLines.length < maxLines) {
        resultLines.push({
          type: 'removed',
          text: item.text,
          oldLine: currentOld,
          newLine: null,
        });
      } else {
        truncated = true;
      }
    } else {
      currentOld++;
      currentNew++;
      if (resultLines.length < maxLines) {
        resultLines.push({
          type: 'unchanged',
          text: item.text,
          oldLine: currentOld,
          newLine: currentNew,
        });
      } else {
        truncated = true;
      }
    }
  }

  return { lines: resultLines, additions, deletions, truncated };
}

/**
 * Pure synchronous change comparison engine.
 * Matches current pages against baseline snapshot pages to produce
 * a complete PendingChangesResponse with rich line-by-line diffs.
 */
export function computeChangesSync(payload: ComputeChangesPayload): PendingChangesResponse {
  const { currentPages, baselinePages, hasBaseline, lastVersion } = payload;
  const changes: PendingChange[] = [];

  const baselineMap = new Map<string, BaselinePageItem>();
  for (const p of baselinePages) {
    baselineMap.set(p.id, p);
  }

  const visitedIds = new Set<string>();

  if (!hasBaseline) {
    // First publish case: every published page is an addition
    for (const p of currentPages) {
      if (!p.isPublished) continue;
      const diff = diffLinesSync('', p.content || '');
      changes.push({
        id: p.id,
        title: p.title,
        path: p.path,
        languageCode: p.languageCode || 'en',
        kind: p.kind || 'PAGE',
        status: 'added',
        fields: ['title', 'content'],
        additions: diff.additions,
        deletions: diff.deletions,
        lines: diff.lines,
        truncated: diff.truncated,
      });
    }

    return {
      changes,
      hasBaseline: false,
      lastVersion,
      redirectIssues: [],
    };
  }

  // Normal comparison with baseline
  for (const p of currentPages) {
    visitedIds.add(p.id);
    const base = baselineMap.get(p.id);

    if (!p.isPublished) {
      // If unpublished now, but was published in baseline -> removed
      if (base?.isPublished) {
        const diff = diffLinesSync(base.content || '', '');
        changes.push({
          id: p.id,
          title: p.title,
          path: p.path,
          languageCode: p.languageCode || 'en',
          kind: p.kind || 'PAGE',
          status: 'removed',
          fields: ['isPublished'],
          additions: 0,
          deletions: diff.deletions,
          lines: diff.lines,
          truncated: diff.truncated,
        });
      }
      continue;
    }

    if (!base) {
      // Newly created page
      const diff = diffLinesSync('', p.content || '');
      changes.push({
        id: p.id,
        title: p.title,
        path: p.path,
        languageCode: p.languageCode || 'en',
        kind: p.kind || 'PAGE',
        status: 'added',
        fields: ['title', 'content'],
        additions: diff.additions,
        deletions: diff.deletions,
        lines: diff.lines,
        truncated: diff.truncated,
      });
    } else {
      // Exists in baseline: check for modifications
      const changedFields: string[] = [];
      if (base.title !== p.title) changedFields.push('title');
      if (base.path !== p.path) changedFields.push('path');
      if (base.slug !== p.slug) changedFields.push('slug');
      if (base.content !== p.content) changedFields.push('content');
      if (base.isPublished !== p.isPublished) changedFields.push('isPublished');

      if (changedFields.length > 0) {
        const diff = diffLinesSync(base.content || '', p.content || '');
        changes.push({
          id: p.id,
          title: p.title,
          path: p.path,
          languageCode: p.languageCode || 'en',
          kind: p.kind || 'PAGE',
          status: 'modified',
          fields: changedFields,
          additions: diff.additions,
          deletions: diff.deletions,
          lines: diff.lines,
          truncated: diff.truncated,
        });
      }
    }
  }

  // Identify deleted pages (in baseline but removed from current pages)
  for (const [baseId, base] of baselineMap.entries()) {
    if (base.isPublished && !visitedIds.has(baseId)) {
      const diff = diffLinesSync(base.content || '', '');
      changes.push({
        id: base.id,
        title: base.title,
        path: base.path,
        languageCode: base.languageCode || 'en',
        kind: base.kind || 'PAGE',
        status: 'removed',
        fields: ['title', 'content'],
        additions: 0,
        deletions: diff.deletions,
        lines: diff.lines,
        truncated: diff.truncated,
      });
    }
  }

  return {
    changes,
    hasBaseline: true,
    lastVersion,
    redirectIssues: [],
  };
}

// In worker runtime: listen to incoming messages
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.onmessage = (e: MessageEvent<DiffWorkerRequest>) => {
    const { id, type, payload } = e.data;
    try {
      if (type === 'compute-changes') {
        const result = computeChangesSync(payload);
        self.postMessage({ id, type, result });
      } else {
        self.postMessage({ id, type, error: `Unknown job type: ${type}` });
      }
    } catch (err) {
      self.postMessage({
        id,
        type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
