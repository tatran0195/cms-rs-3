// @vitest-environment jsdom

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { type CmsClient, createCmsClient } from '../../src';
import { CmsClientProvider, useCmsClient } from '../../src/react';

describe('CmsClientProvider & useCmsClient', () => {
  it('supplies CmsClient through React Context', async () => {
    const client = createCmsClient({ baseUrl: 'https://test.internal' });
    let capturedClient: CmsClient | null = null;

    function TestConsumer() {
      capturedClient = useCmsClient();
      return <div>OK</div>;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CmsClientProvider client={client}>
          <TestConsumer />
        </CmsClientProvider>,
      );
    });

    expect(capturedClient).toBe(client);
    root.unmount();
    container.remove();
  });

  it('throws error when useCmsClient is called outside provider', async () => {
    let capturedError: any = null;

    function BrokenConsumer() {
      try {
        // biome-ignore lint/correctness/useHookAtTopLevel: testing hook error throwing behavior in unit test
        useCmsClient();
      } catch (err) {
        capturedError = err as Error;
      }
      return null;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BrokenConsumer />);
    });

    expect(capturedError?.message).toBe('useCmsClient must be used within a CmsClientProvider');
    root.unmount();
    container.remove();
  });
});
