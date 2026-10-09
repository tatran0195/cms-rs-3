import type { CompleteSetupPayload, SetupStatus } from '@cms/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cmsClient } from '@/shared/services/cms-client';

export const useSetupStatus = (options?: { enabled?: boolean }) =>
  useQuery<SetupStatus>({
    queryKey: ['setup', 'status'],
    enabled: options?.enabled ?? true,
    queryFn: async () => cmsClient.setup.getStatus(),
    staleTime: 30 * 1000,
  });

export const useCompleteSetup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CompleteSetupPayload) => cmsClient.setup.complete(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
      queryClient.invalidateQueries({ queryKey: ['public', 'meta'] });
    },
  });
};
