/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveSiteUrl } from './useLiveSiteUrl';

vi.mock('@cms/sdk/react', () => ({
  useProject: vi.fn(),
  useDomains: vi.fn(),
}));

import { useDomains, useProject } from '@cms/sdk/react';

describe('useLiveSiteUrl', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    const activeRoot = root;
    if (activeRoot) {
      act(() => {
        activeRoot.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  function HookTester({
    projectId,
    onResult,
  }: {
    projectId: string;
    onResult: (res: ReturnType<typeof useLiveSiteUrl>) => void;
  }) {
    const res = useLiveSiteUrl(projectId);
    onResult(res);
    return null;
  }

  it('returns custom verified primary domain url when available', () => {
    vi.mocked(useProject).mockReturnValue({
      data: { id: 'proj-1', slug: 'my-project' },
    } as any);
    vi.mocked(useDomains).mockReturnValue({
      data: [{ domain: 'docs.example.com', isPrimary: true, verified: true }],
    } as any);

    let result: ReturnType<typeof useLiveSiteUrl> | undefined;
    act(() => {
      root!.render(
        <HookTester
          projectId="proj-1"
          onResult={(r) => {
            result = r;
          }}
        />,
      );
    });

    expect(result?.liveDomain).toBe('docs.example.com');
    expect(result?.liveHref).toBe('https://docs.example.com');
    expect(result?.isReady).toBe(true);
  });

  it('falls back to /sites/${projectId} when no custom domain exists', () => {
    vi.mocked(useProject).mockReturnValue({
      data: { id: 'proj-1', slug: 'my-project' },
    } as any);
    vi.mocked(useDomains).mockReturnValue({
      data: [],
    } as any);

    let result: ReturnType<typeof useLiveSiteUrl> | undefined;
    act(() => {
      root!.render(
        <HookTester
          projectId="proj-1"
          onResult={(r) => {
            result = r;
          }}
        />,
      );
    });

    expect(result?.liveHref).toBe('/sites/proj-1');
    expect(result?.isReady).toBe(true);
  });
});
