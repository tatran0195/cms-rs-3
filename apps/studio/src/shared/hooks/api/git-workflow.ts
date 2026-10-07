import type { GitConflictResolutionBody, GitConnectionBody, GitOperationBody } from '@cms/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cmsClient } from '../../services/cms-client';
import { queryKeys } from './query-keys';

export interface GitConflict {
  id: string;
  path: string;
  status: string;
  baseContent: string | null;
  oursContent: string | null;
  theirsContent: string | null;
}

export interface GitOperation {
  id: string;
  kind: string;
  status: string;
  commitMessage: string | null;
  changedFiles: Array<{ path: string; status: string }> | null;
  pullRequestNo: number | null;
  pullRequestUrl: string | null;
  error: string | null;
  createdAt: string;
  conflicts: GitConflict[];
}

export interface GitWorkflowStatus {
  id: string;
  repository: string;
  baseBranch: string;
  headBranch: string;
  contentPath: string;
  credentialConfigured: boolean;
  webhookConfigured: boolean;
  lastSyncStatus: string;
  lastSyncError: string | null;
  lastSyncedAt: string | null;
  operations: GitOperation[];
  pullRequests: Array<{
    id: string;
    number: number;
    url: string;
    title: string;
    draft: boolean;
    state: string;
    previews: Array<{ id: string; status: string; url: string | null; error: string | null }>;
  }>;
  files: Array<{ path: string }>;
}

export const useGitWorkflow = (projectId: string) =>
  useQuery({
    queryKey: queryKeys.gitWorkflow.detail(projectId),
    queryFn: async () => (await cmsClient.git.getStatus(projectId)) as unknown as GitWorkflowStatus | null,
    refetchInterval: (query) =>
      query.state.data?.operations?.some((operation) => operation.status === 'QUEUED' || operation.status === 'RUNNING') ? 2500 : false,
  });

const useGitWorkflowMutation = <TVariables, TResult>(projectId: string, mutationFn: (variables: TVariables) => Promise<TResult>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.gitWorkflow.detail(projectId) }),
  });
};

export const useResolveGitConflict = (projectId: string, conflictId: string) =>
  useGitWorkflowMutation(projectId, async (json: GitConflictResolutionBody) =>
    cmsClient.git.resolveConflict(projectId, conflictId, json),
  );

export const useAuthorizeGitWorkflow = (projectId: string) =>
  useMutation({
    mutationFn: async (token: string) => cmsClient.git.authorize(projectId, { token }),
  });

export const useConnectGitWorkflow = (projectId: string) =>
  useGitWorkflowMutation(projectId, async (json: GitConnectionBody) =>
    cmsClient.git.connect(projectId, json),
  );

export const useDisconnectGitWorkflow = (projectId: string) =>
  useGitWorkflowMutation(projectId, async (_: undefined) =>
    cmsClient.git.disconnect(projectId),
  );

export const useQueueGitOperation = (projectId: string) =>
  useGitWorkflowMutation(projectId, async (json: GitOperationBody) =>
    (await cmsClient.git.queueOperation(projectId, json)) as unknown as GitOperation,
  );

export const useRotateGitWorkflowWebhookSecret = (projectId: string) =>
  useGitWorkflowMutation(projectId, async (_: undefined) =>
    cmsClient.git.rotateWebhookSecret(projectId),
  );
