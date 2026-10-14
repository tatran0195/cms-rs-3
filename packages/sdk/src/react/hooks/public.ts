import { useQuery } from '@tanstack/react-query';
import { useCmsClient } from '../context';

export const useGetPublicMeta = <T = any>(options?: { enabled?: boolean }) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: ['public', 'meta'],
    enabled: options?.enabled ?? true,
    queryFn: async () => (await client.public.getMeta()) as unknown as T,
    staleTime: 5 * 60 * 1000,
  });
};

export const useGetInvitationInfo = <T = any>(invitationId: string) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: ['public', 'invitations', invitationId],
    queryFn: async () => (await client.public.getInvitation(invitationId)) as unknown as T,
  });
};
