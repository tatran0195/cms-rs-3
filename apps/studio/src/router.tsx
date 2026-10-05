import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { ErrorPage, NotFound, PageLoader, queryClient } from '@/shared';
import { routeTree } from './routeTree.gen';

export { queryClient };

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: ErrorPage,
    // Branded loading screen for route transitions that resolve loaders/data.
    // The delay avoids a flash on fast navigations; the min duration prevents a
    // jarring flicker once it does show.
    defaultPendingComponent: PageLoader,
    defaultPendingMs: 200,
    defaultPendingMinMs: 400,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  });
  return router;
}


declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
