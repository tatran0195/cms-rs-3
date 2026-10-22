/**
 * Main-thread client interface communicating with DiffWorker.
 * Transparently falls back to inline synchronous diffing if Web Workers
 * are unavailable (e.g. server-side rendering, Vitest runner, or restricted webviews).
 */

import type { PendingChangesResponse } from '@cms/sdk';
import { type ComputeChangesPayload, computeChangesSync, type DiffWorkerRequest, type DiffWorkerResponse } from './diff-worker';

class DiffWorkerClient {
  private readonly worker: Worker | null = null;
  private readonly pending = new Map<string, { resolve: (val: PendingChangesResponse) => void; reject: (err: Error) => void }>();
  private messageCounter = 0;

  constructor() {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        // Vite syntax for instant Worker instantiation
        this.worker = new Worker(new URL('./diff-worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent<DiffWorkerResponse>) => {
          const { id, result, error } = e.data;
          const deferred = this.pending.get(id);
          if (!deferred) return;
          this.pending.delete(id);
          if (error) {
            deferred.reject(new Error(error));
          } else if (result) {
            deferred.resolve(result);
          } else {
            deferred.reject(new Error('Empty result from diff worker'));
          }
        };
        this.worker.onerror = (err) => {
          // If worker fails unexpectedly, reject all pending jobs
          for (const [id, deferred] of this.pending.entries()) {
            deferred.reject(new Error(err.message || 'Diff worker error'));
            this.pending.delete(id);
          }
        };
      } catch {
        this.worker = null;
      }
    }
  }

  computeChanges(payload: ComputeChangesPayload): Promise<PendingChangesResponse> {
    if (!this.worker) {
      // Direct thread fallback
      try {
        return Promise.resolve(computeChangesSync(payload));
      } catch (err) {
        return Promise.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    const id = `diff-${++this.messageCounter}-${Date.now()}`;
    return new Promise<PendingChangesResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker?.postMessage({ id, type: 'compute-changes', payload } satisfies DiffWorkerRequest);
    });
  }
}

export const diffWorkerClient = new DiffWorkerClient();
