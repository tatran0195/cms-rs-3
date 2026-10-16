import type { MessageKey } from '@cms/i18n';
import type { DeploymentStatus } from '@cms/sdk';

type Translate = (key: MessageKey) => string;

const STATUS_KEY: Record<string, MessageKey> = {
  PENDING: 'deployment.status.pending',
  pending: 'deployment.status.pending',
  BUILDING: 'deployment.status.building',
  building: 'deployment.status.building',
  deploying: 'deployment.status.building',
  READY: 'deployment.status.ready',
  ready: 'deployment.status.ready',
  active: 'deployment.status.ready',
  FAILED: 'deployment.status.failed',
  failed: 'deployment.status.failed',
  deleted: 'deployment.status.failed',
};

/** The localized, human label for a deployment status enum ("READY" → "Live"). */
export const deploymentStatusLabel = (status: DeploymentStatus, t: Translate): string => t(STATUS_KEY[status] ?? 'deployment.status.pending');

/** The design-system Badge variant for a status: failures read as destructive,
 *  the live snapshot as primary, and in-flight states stay muted. */
export const deploymentStatusVariant = (status: DeploymentStatus): 'default' | 'destructive' | 'secondary' => {
  const normalized = status.toUpperCase();
  if (normalized === 'FAILED' || normalized === 'DELETED') {
    return 'destructive';
  }
  return normalized === 'READY' || normalized === 'ACTIVE' ? 'default' : 'secondary';
};
