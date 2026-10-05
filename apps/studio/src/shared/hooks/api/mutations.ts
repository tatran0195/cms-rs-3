import { inferSafeInlineAssetContentType } from '@cms/validators';
import type { InviteMemberBody, MarkNotificationsReadBody, UpdateMemberRoleBody } from '@cms/validators';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { mutateData } from './client-helpers';
import { queryKeys } from './query-keys';
import type { Asset } from './types';

// Re-export feature-owned mutations for backward compatibility
export * from '../../../features/editor/services/editor-api';
export * from '../../../features/project-settings/services/settings-api';
export * from '../../../features/publishing/services/publishing-api';
export * from '../../../features/projects/services/projects-api';

/** Browsers occasionally omit File.type for valid images; never infer an active type. */
const uploadContentType = (file: File): string => file.type.trim() || inferSafeInlineAssetContentType(file.name) || 'application/octet-stream';

/** Presign → PUT bytes → confirm. Returns the recorded asset. */
export const useUploadAsset = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const contentType = uploadContentType(file);
      const presign = await mutateData<{ uploadUrl: string; assetId: string; publicUrl: string }>(
        await api.app.projects[':projectId'].assets.presign.$post({
          param: { projectId },
          json: { filename: file.name, contentType, sizeBytes: file.size },
        }),
        'Could not prepare asset upload.',
      );
      const uploadRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!uploadRes.ok) {
        throw new Error(`Upload failed (${uploadRes.status})`);
      }
      return mutateData<Asset>(
        await api.app.projects[':projectId'].assets.confirm.$post({
          param: { projectId },
          json: { assetId: presign.assetId },
        }),
        'Could not finalize asset upload.',
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all(projectId) }),
  });
};

export const useInviteMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: InviteMemberBody) => mutateData(await api.app.members.invite.$post({ json: body }), 'Could not invite member.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.all() }),
  });
};

export const useUpdateMemberRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateMemberRoleBody }) =>
      mutateData(await api.app.members[':id'].role.$patch({ param: { id }, json: body }), 'Could not update the role.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.all() }),
  });
};

export const useRemoveMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      mutateData(await api.app.members[':id'].$delete({ param: { id } }), 'Could not remove the member.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members.all() }),
  });
};

export const useMarkNotificationsRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: MarkNotificationsReadBody) =>
      mutateData(await api.app.notifications.read.$post({ json: body }), 'Could not update notifications.'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.list() });
      qc.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
    },
  });
};
