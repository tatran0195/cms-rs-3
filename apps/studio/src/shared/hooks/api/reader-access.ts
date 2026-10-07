import type { CreateAudienceBody, InviteReaderBody, JwtAccessConfigBody, ProjectAccessModeBody } from '@cms/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cmsClient } from '../../services/cms-client';
import { queryKeys } from './query-keys';

export interface ReaderAccessData {
  accessMode: 'PUBLIC' | 'WORKSPACE' | 'READERS';
  readers: Array<{
    id: string;
    email: string | null;
    name: string | null;
    status: string;
    audiences: Array<{ audience: { id: string; name: string } }>;
    _count: { sessions: number };
  }>;
  audiences: Array<{
    id: string;
    name: string;
    grants: Array<{ pageId: string | null }>;
    _count: { readers: number };
  }>;
  jwt: {
    enabled: boolean;
    issuer: string;
    audience: string;
    jwksUrl: string | null;
    publicJwks: unknown;
    groupsClaim: string;
    claimMapping: unknown;
    sessionTtlMinutes: number;
    maxTokenAgeSeconds: number;
    clockToleranceSecs: number;
  } | null;
  audit: Array<{ id: string; action: string; createdAt: string }>;
}

export const useReaderAccess = (projectId: string) =>
  useQuery({
    queryKey: queryKeys.readerAccess.detail(projectId),
    queryFn: async () => (await cmsClient.readerAccess.get(projectId)) as unknown as ReaderAccessData,
  });

const useReaderAccessMutation = <TVariables, TResult>(projectId: string, mutationFn: (variables: TVariables) => Promise<TResult>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.readerAccess.detail(projectId) }),
  });
};

export const useUpdateReaderAccessMode = (projectId: string) =>
  useReaderAccessMutation(projectId, async (json: ProjectAccessModeBody) => cmsClient.readerAccess.updateMode(projectId, json));

export const useCreateReaderAudience = (projectId: string) =>
  useReaderAccessMutation(projectId, async (json: CreateAudienceBody) => cmsClient.readerAccess.createAudience(projectId, json));

export const useDeleteReaderAudience = (projectId: string) =>
  useReaderAccessMutation(projectId, async (audienceId: string) => cmsClient.readerAccess.deleteAudience(projectId, audienceId));

export const useInviteReader = (projectId: string) =>
  useReaderAccessMutation(projectId, async (json: InviteReaderBody) => cmsClient.readerAccess.inviteReader(projectId, json));

export const useRevokeReader = (projectId: string) =>
  useReaderAccessMutation(projectId, async (readerId: string) => cmsClient.readerAccess.revokeReader(projectId, readerId));

export const useUpdateReaderJwt = (projectId: string) =>
  useReaderAccessMutation(projectId, async (json: JwtAccessConfigBody) => cmsClient.readerAccess.updateJwt(projectId, json));

export const useTestReaderJwt = (projectId: string) =>
  useMutation({
    mutationFn: async (token: string) => cmsClient.readerAccess.testJwt(projectId, { token }),
  });

export const useEmergencyRevokeReaderAccess = (projectId: string) =>
  useReaderAccessMutation(projectId, async (_: undefined) => cmsClient.readerAccess.emergencyRevoke(projectId));
