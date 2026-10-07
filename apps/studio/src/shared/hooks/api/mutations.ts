import type { InviteMemberBody, MarkNotificationsReadBody, UpdateMemberRoleBody } from '@cms/validators';
import { inferSafeInlineAssetContentType } from '@cms/validators';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cmsClient } from '../../services/cms-client';
import { queryKeys } from './query-keys';
import type { Asset } from './types';

// Re-export feature-owned mutations for backward compatibility
export * from '../../../features/editor/services/editor-api';
export * from '../../../features/project-settings/services/settings-api';
export * from '../../../features/projects/services/projects-api';
export * from '../../../features/publishing/services/publishing-api';

/** Browsers occasionally omit File.type for valid images; never infer an active type. */
const uploadContentType = (file: File): string => file.type.trim() || inferSafeInlineAssetContentType(file.name) || 'application/octet-stream';

/** Presign → PUT bytes → confirm. Returns the recorded asset. */
export const useUploadAsset = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const contentType = uploadContentType(file);
      const presign = await cmsClient.assets.presign(projectId, {
        filename: file.name,
        mimeType: contentType,
        sizeBytes: file.size,
      });
      const uploadRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!uploadRes.ok) {
        throw new Error(`Upload failed (${uploadRes.status})`);
      }
      return (await cmsClient.assets.confirm(projectId, {
        assetId: presign.assetId,
      } as any)) as unknown as Asset;
    },
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
