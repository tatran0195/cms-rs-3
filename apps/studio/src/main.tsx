import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { CmsClientProvider } from '@cms/sdk/react';
import { getRouter, queryClient } from './router';
import { cmsClient } from './shared/services/cms-client';
import './styles.css';

const router = getRouter();

const rootElement = document.getElementById('root');
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <CmsClientProvider client={cmsClient}>
          <RouterProvider router={router} />
        </CmsClientProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
