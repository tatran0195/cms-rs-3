import type { MessageKey } from '@cms/i18n';
import type { IntegrationPublicConfig } from '@cms/shared/integrations';

type SearchRuntime = Extract<IntegrationPublicConfig, { providerId: 'qdrant' }>['searchRuntime'];

export const SEARCH_RUNTIME_MESSAGE_KEYS = {
  legacy: 'settings.integrations.value.runtime.legacy',
  shadow: 'settings.integrations.value.runtime.shadow',
  hybrid: 'settings.integrations.value.runtime.hybrid',
} as const satisfies Record<SearchRuntime, MessageKey>;
