import {
  useGitWorkflow as useSdkGitWorkflow,
  useResolveGitConflict,
  useAuthorizeGitWorkflow,
  useConnectGitWorkflow,
  useDisconnectGitWorkflow,
  useQueueGitOperation,
  useRotateGitWorkflowWebhookSecret,
} from '@cms/sdk/react';

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

export const useGitWorkflow = (projectId: string) => useSdkGitWorkflow<GitWorkflowStatus | null>(projectId);

export {
  useResolveGitConflict,
  useAuthorizeGitWorkflow,
  useConnectGitWorkflow,
  useDisconnectGitWorkflow,
  useQueueGitOperation,
  useRotateGitWorkflowWebhookSecret,
};
