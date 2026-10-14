import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCmsClient } from '../context';
import { queryKeys } from '../query-keys';

export const useGitWorkflow = <T = any>(projectId: string) => {
  const client = useCmsClient();
  return useQuery({
    queryKey: queryKeys.gitWorkflow.detail(projectId),
    queryFn: async () => (await client.git.getStatus(projectId)) as unknown as T,
    refetchInterval: (query: any) =>
      query.state.data?.operations?.some((operation: any) => operation.status === 'QUEUED' || operation.status === 'RUNNING') ? 2500 : false,
  });
};

const useGitWorkflowMutation = <TVariables = any, TResult = any>(
  projectId: string,
  mutationFn: (client: ReturnType<typeof useCmsClient>, variables: TVariables) => Promise<TResult>
) => {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation<TResult, Error, TVariables>({
    mutationFn: (vars: TVariables) => mutationFn(client, vars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.gitWorkflow.detail(projectId) }),
  });
};


export const useResolveGitConflict = <T = any>(projectId: string, conflictId: string) =>
  useGitWorkflowMutation(projectId, (client, json: any) => client.git.resolveConflict<T>(projectId, conflictId, json));

export const useAuthorizeGitWorkflow = (projectId: string) => {
  const client = useCmsClient();
  return useMutation({
    mutationFn: async (token: string) => client.git.authorize(projectId, { token }),
  });
};

export const useConnectGitWorkflow = <T = any>(projectId: string) =>
  useGitWorkflowMutation(projectId, (client, json: any) => client.git.connect<T>(projectId, json));

export const useDisconnectGitWorkflow = (projectId: string) =>
  useGitWorkflowMutation(projectId, (client, _: undefined) => client.git.disconnect(projectId));

export const useQueueGitOperation = <T = any>(projectId: string) =>
  useGitWorkflowMutation(projectId, (client, json: any) => client.git.queueOperation<T>(projectId, json));

export const useRotateGitWorkflowWebhookSecret = (projectId: string) =>
  useGitWorkflowMutation(projectId, (client, _: undefined) => client.git.rotateWebhookSecret(projectId));
