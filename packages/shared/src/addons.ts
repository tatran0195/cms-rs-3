import { z } from 'zod';

export const ADDON_GROUPS = ['engagement'] as const;
export type AddonGroup = 'engagement';

export const ADDON_IDS = ['feedback', 'edit-suggestions', 'issue-links'] as const;
export type AddonId = 'feedback' | 'edit-suggestions' | 'issue-links';

export const addonIdSchema = z.enum(ADDON_IDS);

export type AddonAuditAction = 'configured' | 'activated' | 'deactivated';
export const addonAuditActionSchema = z.enum(['configured', 'activated', 'deactivated']);

export interface AddonConfigById {
  feedback: { placement: 'after-content' | 'after-navigation'; presentation: 'compact' | 'card' };
  'edit-suggestions': { urlTemplate?: string };
  'issue-links': { urlTemplate?: string };
}

export interface AddonDefinition<Id extends AddonId = AddonId> {
  id: Id;
  group: AddonGroup;
  defaultEnabled: boolean;
  defaultConfig: AddonConfigById[Id];
  requiresConfiguration: boolean;
}

const urlTemplateSchema = (allowedPlaceholders: readonly string[]) =>
  z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => {
      const substituted = value
        .replaceAll('{path}', 'page')
        .replaceAll('{encodedPath}', 'page')
        .replaceAll('{url}', 'https%3A%2F%2Fdocs.example.com');
      if (/[{}]/.test(substituted)) return false;
      try {
        const parsed = new URL(substituted);
        return ['http:', 'https:'].includes(parsed.protocol) && !(parsed.username || parsed.password);
      } catch {
        return false;
      }
    }, 'URL template must be an http(s) URL without embedded credentials.')
    .refine(
      (value) => [...value.matchAll(/\{([^{}]+)\}/g)].every((match) => allowedPlaceholders.includes(match[1] ?? '')),
      'URL template contains an unsupported placeholder.',
    );

export const addonConfigSchemas = {
  feedback: z
    .object({
      placement: z.enum(['after-content', 'after-navigation']).default('after-content'),
      presentation: z.enum(['compact', 'card']).default('compact'),
    })
    .strict(),
  'edit-suggestions': z.object({ urlTemplate: urlTemplateSchema(['path', 'encodedPath']).optional() }).strict(),
  'issue-links': z.object({ urlTemplate: urlTemplateSchema(['url', 'path', 'encodedPath']).optional() }).strict(),
} as const satisfies { [Id in AddonId]: z.ZodType<AddonConfigById[Id]> };

export const parseAddonConfig = <Id extends AddonId>(addonId: Id, config: unknown): AddonConfigById[Id] =>
  addonConfigSchemas[addonId].parse(config) as AddonConfigById[Id];

export const normalizeAddonConfig = <Id extends AddonId>(addonId: Id, config: unknown): AddonConfigById[Id] => {
  const parsed = addonConfigSchemas[addonId].safeParse(config);
  return (parsed.success ? parsed.data : ADDON_REGISTRY[addonId].defaultConfig) as AddonConfigById[Id];
};

export const ADDON_REGISTRY = {
  feedback: {
    id: 'feedback',
    group: 'engagement',
    defaultEnabled: true,
    defaultConfig: { placement: 'after-content', presentation: 'compact' },
    requiresConfiguration: false,
  },
  'edit-suggestions': {
    id: 'edit-suggestions',
    group: 'engagement',
    defaultEnabled: true,
    defaultConfig: {},
    requiresConfiguration: true,
  },
  'issue-links': {
    id: 'issue-links',
    group: 'engagement',
    defaultEnabled: true,
    defaultConfig: {},
    requiresConfiguration: true,
  },
} as const satisfies { [Id in AddonId]: AddonDefinition<Id> };

export const addonDefinitions = ADDON_IDS.map((id) => ADDON_REGISTRY[id]);

export const isAddonId = (value: string): value is AddonId => ADDON_IDS.some((id) => id === value);

export interface ProjectAddonProjectionRow {
  key: AddonId;
  enabled: boolean;
  config: unknown;
}

export const addonConfigRecordSchema = z.record(z.string(), z.unknown());

export const parseAddonConfigRecord = (value: unknown): Record<string, unknown> => {
  const parsed = addonConfigRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
};

const rowById = (rows: readonly ProjectAddonProjectionRow[]) => new Map(rows.map((row) => [row.key, row]));

/**
 * Produce the backwards-compatible public Project.config add-on projection.
 * Durable ProjectAddon rows are authoritative; unrelated top-level config is
 * preserved so themes, search, analytics providers, and Git-native ownership do
 * not become part of the add-on domain.
 */
export const projectConfigWithAddons = (rawConfig: unknown, rows: readonly ProjectAddonProjectionRow[]): Record<string, unknown> => {
  const current = parseAddonConfigRecord(rawConfig);
  const currentAddons = parseAddonConfigRecord(current.addons);
  const preservedAddons = { ...currentAddons };
  delete preservedAddons.editUrl;
  delete preservedAddons.issueUrl;
  const currentAnalytics = parseAddonConfigRecord(current.analytics);
  const byId = rowById(rows);
  const state = <Id extends AddonId>(id: Id) => {
    const row = byId.get(id);
    return {
      enabled: row?.enabled ?? ADDON_REGISTRY[id].defaultEnabled,
      config: normalizeAddonConfig(id, row?.config ?? ADDON_REGISTRY[id].defaultConfig),
    };
  };
  const feedback = state('feedback');
  const editSuggestions = state('edit-suggestions');
  const issueLinks = state('issue-links');

  return {
    ...current,
    addons: {
      ...preservedAddons,
      feedback: feedback.enabled,
      feedbackPlacement: feedback.config.placement,
      feedbackPresentation: feedback.config.presentation,
      editSuggestions: editSuggestions.enabled,
      ...(editSuggestions.config.urlTemplate ? { editUrl: editSuggestions.config.urlTemplate } : {}),
      issueLinks: issueLinks.enabled,
      ...(issueLinks.config.urlTemplate ? { issueUrl: issueLinks.config.urlTemplate } : {}),
    },
    analytics: currentAnalytics,
  };
};
