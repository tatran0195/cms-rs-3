import type { InviteMemberBody, MarkNotificationsReadBody, UpdateMemberRoleBody } from '@cms/validators';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cmsClient } from '../../services/cms-client';
import { queryKeys } from './query-keys';
import type { Asset } from './types';

// Re-export feature-owned mutations for backward compatibility
export * from '../../../features/editor/services/editor-api';
export * from '../../../features/project-settings/services/settings-api';
export * from '../../../features/projects/services/projects-api';
export * from '../../../features/publishing/services/publishing-api';

/** Complete upload workflow via SDK (Presign → PUT bytes → confirm). Returns the recorded asset. */
export const useUploadAsset = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => (await cmsClient.assets.upload(projectId, file)) as unknown as Asset,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all(projectId) }),
  });
};

export const useInviteMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: InviteMemberBody) => cmsClient.workspace.inviteMember(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.all() }),
  });
};

export const useUpdateMemberRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateMemberRoleBody }) => cmsClient.workspace.updateMemberRole(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.all() }),
  });
};

export const useRemoveMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => cmsClient.workspace.removeMember(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.all() }),
  });
};

export const useMarkNotificationsRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: MarkNotificationsReadBody) => cmsClient.notifications.markRead(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.list() });
      qc.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
    },
  });
};
