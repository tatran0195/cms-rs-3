import { useT } from '@cms/i18n/react';
import { CmsApiError } from '@cms/sdk';
import type { IntegrationCatalogEntry, IntegrationConnectionSummary, IntegrationProviderId } from '@cms/shared/integrations';
import type {
  CreateProjectIntegrationBody,
  IntegrationRevisionBody,
  UpdateProjectIntegrationBody,
  VerifyProjectIntegrationBody,
} from '@cms/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cmsClient } from '../../services/cms-client';
import { queryKeys } from './query-keys';

type ConfigurableProviderId = 'slack' | 'discord' | 'zapier';

export const useProjectIntegrations = (projectId: string) => {
  const _t = useT();
  return useQuery({
    enabled: Boolean(projectId),
    queryKey: queryKeys.integrations.all(projectId),
    queryFn: async () => (await cmsClient.integrations.list(projectId)) as unknown as IntegrationCatalogEntry[],
  });
};

const useIntegrationMutation = <TVariables, TResult>(projectId: string, mutationFn: (variables: TVariables) => Promise<TResult>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all(projectId) }),
    onError: async (error) => {
      if (error instanceof CmsApiError && error.code === 'integration:revision_conflict') {
        await queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all(projectId), exact: true, refetchType: 'all' });
      }
    },
  });
};

export const useCreateProjectIntegration = (projectId: string) => {
  const _t = useT();
  return useIntegrationMutation(
    projectId,
    async (json: CreateProjectIntegrationBody) => await cmsClient.integrations.create<IntegrationConnectionSummary>(projectId, json),
  );
};

export const useUpdateProjectIntegration = (projectId: string) => {
  const _t = useT();
  return useIntegrationMutation(
    projectId,
    async ({ providerId, body }: { providerId: ConfigurableProviderId; body: UpdateProjectIntegrationBody }) =>
      await cmsClient.integrations.update<IntegrationConnectionSummary>(projectId, providerId, body),
  );
};

const useStatusProjectIntegration = (projectId: string, action: 'activate' | 'deactivate') => {
  const _t = useT();
  return useIntegrationMutation(projectId, async ({ providerId, body }: { providerId: ConfigurableProviderId; body: IntegrationRevisionBody }) =>
    action === 'activate'
      ? await cmsClient.integrations.activate<IntegrationConnectionSummary>(projectId, providerId, body)
      : await cmsClient.integrations.deactivate<IntegrationConnectionSummary>(projectId, providerId, body),
  );
};

export const useActivateProjectIntegration = (projectId: string) => useStatusProjectIntegration(projectId, 'activate');
export const useDeactivateProjectIntegration = (projectId: string) => useStatusProjectIntegration(projectId, 'deactivate');

export const useVerifyProjectIntegration = (projectId: string) => {
  const _t = useT();
  return useIntegrationMutation(
    projectId,
    async ({ providerId, body }: { providerId: IntegrationProviderId; body: VerifyProjectIntegrationBody }) =>
      await cmsClient.integrations.verify<IntegrationCatalogEntry | IntegrationConnectionSummary>(projectId, providerId, body),
  );
};

export const useDeleteProjectIntegration = (projectId: string) => {
  const _t = useT();
  return useIntegrationMutation(
    projectId,
    async ({ providerId, expectedRevision }: { providerId: ConfigurableProviderId; expectedRevision: number }) => {
      const confirmation = await cmsClient.integrations.requestDeleteConfirmation(projectId, providerId, {
        expectedRevision,
      });
      await cmsClient.integrations.delete(projectId, providerId, {
        json: { confirmationToken: confirmation.confirmationToken },
      });
      return { providerId, deleted: true as const };
    },
  );
};
