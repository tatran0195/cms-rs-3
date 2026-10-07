import { useQuery } from '@tanstack/react-query';
import { cmsClient } from '../../services/cms-client';

export const useGetPublicMeta = (options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['public', 'meta'],
    enabled: options?.enabled ?? true,
    queryFn: async () => cmsClient.public.getMeta(),
    staleTime: 5 * 60 * 1000,
  });

export const useGetInvitationInfo = (invitationId: string) =>
  useQuery({
    queryKey: ['public', 'invitations', invitationId],
    queryFn: async () => cmsClient.public.getInvitation(invitationId),
  });
