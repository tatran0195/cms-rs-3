import type { IntegrationCatalogEntry } from '@cms/shared/integrations';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CmsApiError } from '../../errors';
import { useCmsClient } from '../context';
import { queryKeys } from '../query-keys';

export const useProjectIntegrations = <T = IntegrationCatalogEntry>(projectId: string) => {
  const client = useCmsClient();
  return useQuery({
    enabled: Boolean(projectId),
    queryKey: queryKeys.integrations.all(projectId),
    queryFn: async () => (await client.integrations.list(projectId)) as unknown as T[],
  });
};

const useIntegrationMutation = <TVariables = any, TResult = any>(
  projectId: string,
  mutationFn: (client: ReturnType<typeof useCmsClient>, variables: TVariables) => Promise<TResult>,
) => {
  const client = useCmsClient();
  const queryClient = useQueryClient();
  return useMutation<TResult, Error, TVariables>({
    mutationFn: (vars: TVariables) => mutationFn(client, vars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all(projectId) }),
    onError: async (error) => {
      if (error instanceof CmsApiError && error.code === 'integration:revision_conflict') {
        await queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all(projectId), exact: true, refetchType: 'all' });
      }
    },
  });
};

export const useCreateProjectIntegration = <T = any>(projectId: string) =>
  useIntegrationMutation(projectId, (client, json: any) => client.integrations.create<T>(projectId, json));

export const useUpdateProjectIntegration = <T = any>(projectId: string) =>
  useIntegrationMutation(projectId, (client, { providerId, body }: { providerId: string; body: any }) =>
    client.integrations.update<T>(projectId, providerId, body),
  );

export const useActivateProjectIntegration = <T = any>(projectId: string) =>
  useIntegrationMutation(projectId, (client, { providerId, body }: { providerId: string; body: any }) =>
    client.integrations.activate<T>(projectId, providerId, body),
  );

export const useDeactivateProjectIntegration = <T = any>(projectId: string) =>
  useIntegrationMutation(projectId, (client, { providerId, body }: { providerId: string; body: any }) =>
    client.integrations.deactivate<T>(projectId, providerId, body),
  );

export const useVerifyProjectIntegration = <T = any>(projectId: string) =>
  useIntegrationMutation(projectId, (client, { providerId, body }: { providerId: string; body: any }) =>
    client.integrations.verify<T>(projectId, providerId, body),
  );

export const useDeleteProjectIntegration = (projectId: string) =>
  useIntegrationMutation(projectId, async (client, { providerId, expectedRevision }: { providerId: string; expectedRevision: number }) => {
    const confirmation = await client.integrations.requestDeleteConfirmation(projectId, providerId, {
      expectedRevision,
    });
    await client.integrations.delete(projectId, providerId, {
      json: { confirmationToken: confirmation.confirmationToken },
    });
    return { providerId, deleted: true as const };
  });
