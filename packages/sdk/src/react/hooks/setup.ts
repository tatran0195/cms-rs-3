import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCmsClient } from '../context';

export const useSetupStatus = <T = any>(options?: { enabled?: boolean }) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: ['setup', 'status'],
    enabled: options?.enabled ?? true,
    queryFn: async () => (await client.setup.getStatus()) as unknown as T,
    staleTime: 30 * 1000,
  });
};

export const useCompleteSetup = <T = any>() => {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => (await client.setup.complete(payload)) as unknown as T,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
      queryClient.invalidateQueries({ queryKey: ['public', 'meta'] });
    },
  });
};
