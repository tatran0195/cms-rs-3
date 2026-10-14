import {
  useProjectIntegrations as useSdkProjectIntegrations,
  useCreateProjectIntegration,
  useUpdateProjectIntegration,
  useActivateProjectIntegration,
  useDeactivateProjectIntegration,
  useVerifyProjectIntegration,
  useDeleteProjectIntegration,
} from '@cms/sdk/react';
import type { IntegrationCatalogEntry } from '@cms/shared/integrations';

export const useProjectIntegrations = (projectId: string) => useSdkProjectIntegrations<IntegrationCatalogEntry>(projectId);

export {
  useCreateProjectIntegration,
  useUpdateProjectIntegration,
  useActivateProjectIntegration,
  useDeactivateProjectIntegration,
  useVerifyProjectIntegration,
  useDeleteProjectIntegration,
};
