import {
  useProjects as useSdkProjects,
  useProject as useSdkProject,
  useProjectMembers as useSdkProjectMembers,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useInviteProjectMember,
  useUpdateProjectMemberRole,
  useTransferProjectOwnership,
  useRemoveProjectMember,
  useCancelProjectInvitation,
} from '@cms/sdk/react';
import type { Project } from '../../../shared/hooks/api/types';

export const useProjects = (options?: { enabled?: boolean }) => useSdkProjects<Project>(options);
export const useProject = (projectId: string | undefined, options?: { enabled?: boolean }) => useSdkProject<Project>(projectId, options);
export const useProjectMembers = (projectId: string | undefined, options?: { enabled?: boolean }) => useSdkProjectMembers(projectId, options);

export {
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useInviteProjectMember,
  useUpdateProjectMemberRole,
  useTransferProjectOwnership,
  useRemoveProjectMember,
  useCancelProjectInvitation,
};
