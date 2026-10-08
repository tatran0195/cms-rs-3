import type { CmsClient } from '@cms/sdk';
import { useQuery } from '@tanstack/react-query';
import { authService } from '../service/auth-service';
import type { AuthSessionData } from '../types';
import { authKeys } from './keys';

export function useSession(client: CmsClient) {
  const query = useQuery<AuthSessionData | null>({
    queryKey: authKeys.session(),
    queryFn: () => authService.getSession(client),
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: query.data ?? null,
    isPending: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
