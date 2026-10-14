import {
  useDeployments as useSdkDeployments,
  usePendingChanges as useSdkPendingChanges,
  usePublish,
  usePublishAnyway,
  useRollback,
} from '@cms/sdk/react';
import type { Deployment, PendingChange } from '../../../shared/hooks/api/types';

export interface RedirectIssue {
  code: string;
  rowIndexes: number[];
  sequence: string[];
  message: string;
}

export interface PendingChangesResponse {
  changes: PendingChange[];
  hasBaseline?: boolean;
  lastVersion?: number;
  redirectIssues?: RedirectIssue[];
}

export const useDeployments = (projectId: string | undefined, options?: { enabled?: boolean; pollIntervalMs?: number }) =>
  useSdkDeployments<Deployment>(projectId, options);

export const usePendingChanges = (projectId: string | undefined, options?: { enabled?: boolean }) =>
  useSdkPendingChanges<PendingChangesResponse>(projectId, options);

export { usePublish, usePublishAnyway, useRollback };
