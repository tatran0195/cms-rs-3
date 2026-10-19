// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type SiteVersion, VersionSwitcher } from './version-switcher';

describe('VersionSwitcher', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const mockVersions: SiteVersion[] = [
    { id: 'v1', name: 'v1.0', slug: 'v1.0', isDefault: true },
    { id: 'v2', name: 'v2.0', slug: 'v2.0', isDefault: false },
    { id: 'v3', name: 'v3.0', slug: 'v3.0', isDefault: false },
  ];

  it('renders nothing when versions is empty and activeSlug is empty', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(<VersionSwitcher versions={[]} activeSlug="" onChange={onChange} />);
    });

    expect(container.innerHTML).toBe('');
  });

  it('renders a badge indicator when only 1 version exists', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(<VersionSwitcher versions={[{ id: 'v1', name: 'v1.0', slug: 'v1.0', isDefault: true }]} activeSlug="v1.0" onChange={onChange} />);
    });

    expect(container.textContent).toContain('v1.0');
    // Single version does not render a dropdown chevron
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders a badge indicator when versions is empty but activeSlug is provided', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(<VersionSwitcher versions={[]} activeSlug="v1.0" onChange={onChange} />);
    });

    expect(container.textContent).toContain('v1.0');
  });

  it('renders dropdown menu trigger when multiple versions exist', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(<VersionSwitcher versions={mockVersions} activeSlug="v1.0" onChange={onChange} />);
    });

    const trigger = container.querySelector('button');
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain('v1.0');
  });
});
