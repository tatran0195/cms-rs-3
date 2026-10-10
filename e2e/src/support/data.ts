/**
 * Deterministic-but-unique test data.
 *
 * Every entity this suite creates is namespaced with a short run id so a test
 * never collides with another worker's data, while staying human-readable in
 * screenshots, toasts and failure reports.
 */

let counter = 0;

export function runId(): string {
  const stamp = Date.now().toString(36).slice(-6);
  const rand = Math.random().toString(36).slice(2, 5);
  counter += 1;
  return `E2E${stamp}${rand}${counter.toString(36)}`;
}

export interface Named {
  /** Human-readable label, e.g. "E2E English a1b2c3". */
  label: string;
}

export function uniqueName(kind: string, suffix = ''): string {
  const base = `E2E ${kind} ${runId()}`;
  return suffix ? `${base} ${suffix}` : base;
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}.${runId().toLowerCase()}@cms-e2e.local`;
}

/** Marker string that must never appear on a published page after a rollback. */
export function marker(kind: string): string {
  return `${kind}-${runId()}`;
}
