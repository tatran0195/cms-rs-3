import type { BaselinePageItem, PendingChangesResponse } from '@cms/sdk';
import { queryKeys, useBaselineSnapshot } from '@cms/sdk/react';
import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { diffWorkerClient } from '../utils/diff-worker-client';

export interface DraftOverride {
  id: string;
  title: string;
  content: string;
}

export interface PerformChangeDetectionOptions {
  queryClient: QueryClient;
  projectId: string;
  currentPages: BaselinePageItem[];
  baselinePages: BaselinePageItem[];
  hasBaseline: boolean;
  lastVersion?: number | null;
}

/**
 * Normalizes input page structures into BaselinePageItem format,
 * seamlessly overlaying any in-memory active draft for immediate real-time diffing.
 */
export function preparePagesForWorker(
  pages?: Array<Partial<BaselinePageItem> & { id: string }> | null,
  activeDraft?: DraftOverride | null,
): BaselinePageItem[] {
  if (!pages) return [];
  return pages.map((p) => {
    const isDraft = activeDraft && activeDraft.id === p.id;
    return {
      id: p.id,
      title: isDraft ? activeDraft.title : (p.title ?? ''),
      path: p.path ?? '',
      slug: p.slug ?? '',
      content: isDraft ? activeDraft.content : (p.content ?? ''),
      isPublished: p.isPublished ?? true,
      languageCode: p.languageCode ?? 'en',
      kind: p.kind ?? 'PAGE',
    };
  });
}

/**
 * Dispatches diff computation to the Web Worker and immediately seeds
 * TanStack Query cache under queryKeys.deployments.changes(projectId).
 */
export async function performChangeDetection({
  queryClient,
  projectId,
  currentPages,
  baselinePages,
  hasBaseline,
  lastVersion,
}: PerformChangeDetectionOptions): Promise<PendingChangesResponse> {
  const result = await diffWorkerClient.computeChanges({
    currentPages,
    baselinePages,
    hasBaseline,
    lastVersion: lastVersion ?? undefined,
  });

  queryClient.setQueryData(queryKeys.deployments.changes(projectId), result);
  return result;
}

export interface UseChangeDetectionWorkerOptions {
  projectId: string;
  pages?: Array<Partial<BaselinePageItem> & { id: string }> | null;
  activeDraft?: DraftOverride | null;
  enabled?: boolean;
}

/**
 * Background hook that automatically runs change detection via client Web Worker
 * whenever pages are updated, created, deleted, or actively edited.
 * Pre-warms TanStack Query cache so opening PublishModal is 100% instant (0ms loading).
 */
export function useChangeDetectionWorker({ projectId, pages, activeDraft, enabled = true }: UseChangeDetectionWorkerOptions) {
  const queryClient = useQueryClient();
  const [isComputing, setIsComputing] = useState(false);
  const baselineQuery = useBaselineSnapshot(projectId, { enabled: Boolean(projectId) && enabled });

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recompute = useCallback(async () => {
    if (!projectId || !enabled) return;
    const baseline = baselineQuery.data;
    if (baselineQuery.isPending && !baseline) return;

    const currentPages = preparePagesForWorker(pages, activeDraft);
    const baselinePages = baseline?.pages ?? [];
    const hasBaseline = baseline?.hasBaseline ?? true;
    const lastVersion = baseline?.version ?? null;

    setIsComputing(true);
    try {
      await performChangeDetection({
        queryClient,
        projectId,
        currentPages,
        baselinePages,
        hasBaseline,
        lastVersion,
      });
    } catch (err) {
      console.warn('Worker change detection warning:', err);
    } finally {
      setIsComputing(false);
    }
  }, [projectId, enabled, pages, activeDraft, baselineQuery.data, baselineQuery.isPending, queryClient]);

  // Debounced trigger on page tree or active draft content changes
  useEffect(() => {
    if (!enabled || !projectId) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void recompute();
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled, projectId, recompute]);

  return { isComputing, recompute };
}
