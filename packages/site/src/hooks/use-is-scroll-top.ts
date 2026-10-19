import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  if (typeof window === 'undefined')
    return () => {
      /* noop */
    };
  window.addEventListener('scroll', onChange, { passive: true });
  return () => window.removeEventListener('scroll', onChange);
};
const noop = () => () => {
  /* noop */
};
const getServerSnapshot = () => undefined;

/**
 * Returns whether scroll position is at the top of the viewport (< threshold px).
 * Returns `undefined` on server or during hydration.
 */
export function useIsScrollTop({ enabled = true, threshold = 10 }: { enabled?: boolean; threshold?: number } = {}): boolean | undefined {
  return useSyncExternalStore(
    enabled ? subscribe : noop,
    () => (enabled ? (typeof window !== 'undefined' ? window.scrollY < threshold : true) : undefined),
    getServerSnapshot,
  );
}
