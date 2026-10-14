// @vitest-environment jsdom

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { createCmsClient } from '../../src';
import { CmsClientProvider, useProjects, useUploadAsset, useSite } from '../../src/react';

const waitForHook = async (getVal: () => any) => {
  for (let i = 0; i < 20; i++) {
    if (getVal()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
};

describe('TanStack Query hooks in @cms/sdk/react', () => {
  it('useProjects fetches projects via CmsClient from context', async () => {
    const mockProjects = [{ id: 'p1', name: 'Documentation' }];
    const client = createCmsClient({ baseUrl: 'https://cms.test' });
    vi.spyOn(client.projects, 'list').mockResolvedValue(mockProjects as any);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    let hookResult: any = null;

    function TestConsumer() {
      hookResult = useProjects();
      return <div>{hookResult.data ? hookResult.data[0].name : 'loading'}</div>;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <CmsClientProvider client={client}>
            <TestConsumer />
          </CmsClientProvider>
        </QueryClientProvider>
      );
    });

    await waitForHook(() => hookResult?.data);

    expect(hookResult.data).toEqual(mockProjects);
    root.unmount();
    container.remove();
  });

  it('useUploadAsset delegates upload directly to client.assets.upload', async () => {
    const client = createCmsClient({ baseUrl: 'https://cms.test' });
    const mockAsset = { id: 'asset-123', url: 'https://cdn.example.com/logo.png' };
    const uploadSpy = vi.spyOn(client.assets, 'upload').mockResolvedValue(mockAsset as any);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    let mutateFn: any = null;

    function TestUploadConsumer() {
      const mutation = useUploadAsset('proj-1');
      mutateFn = mutation.mutateAsync;
      return <div>upload consumer</div>;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <CmsClientProvider client={client}>
            <TestUploadConsumer />
          </CmsClientProvider>
        </QueryClientProvider>
      );
    });

    const fakeFile = new File(['image-data'], 'logo.png', { type: 'image/png' });
    let uploadResult: any = null;

    await act(async () => {
      uploadResult = await mutateFn(fakeFile);
    });

    expect(uploadSpy).toHaveBeenCalledWith('proj-1', fakeFile);
    expect(uploadResult).toEqual(mockAsset);

    root.unmount();
    container.remove();
  });

  it('useSite fetches public site data via client.sites.getSite', async () => {
    const client = createCmsClient({ baseUrl: 'https://cms.test' });
    const mockSite = { id: 'site-docs', name: 'My Public Docs' };
    const siteSpy = vi.spyOn(client.sites, 'getSite').mockResolvedValue(mockSite as any);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    let hookResult: any = null;

    function TestSiteConsumer() {
      hookResult = useSite('site-docs', { language: 'en' });
      return <div>{hookResult.data ? hookResult.data.name : 'loading'}</div>;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <CmsClientProvider client={client}>
            <TestSiteConsumer />
          </CmsClientProvider>
        </QueryClientProvider>
      );
    });

    await waitForHook(() => hookResult?.data);

    expect(siteSpy).toHaveBeenCalledWith('site-docs', { language: 'en', version: undefined });
    expect(hookResult.data).toEqual(mockSite);

    root.unmount();
    container.remove();
  });
});
