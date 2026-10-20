import type { DocsLayoutId } from '@cms/shared/themes';
import { DocsStandardLayoutTemplate } from './docs-layout';
import { FluxLayoutTemplate } from './flux-layout';
import { GlassLayoutTemplate } from './glass-layout';
import { NotebookLayoutTemplate } from './notebook-layout';
import { SpaciousLayoutTemplate } from './spacious-layout';
import type { DocsLayoutTemplate } from './types';

export { DocsStandardLayoutTemplate } from './docs-layout';
export { FluxLayoutTemplate, FluxTabDropdown } from './flux-layout';
export { GlassLayoutTemplate } from './glass-layout';
export { NotebookLayoutTemplate } from './notebook-layout';
export * from './page';
export * from './shared';
export { SpaciousLayoutTemplate } from './spacious-layout';
export * from './types';

const registry: Record<DocsLayoutId, DocsLayoutTemplate> = {
  docs: DocsStandardLayoutTemplate,
  notebook: NotebookLayoutTemplate,
  glass: GlassLayoutTemplate,
  flux: FluxLayoutTemplate,
  spacious: SpaciousLayoutTemplate,
};

export const registerDocsLayoutTemplate = (id: DocsLayoutId, template: DocsLayoutTemplate): void => {
  registry[id] = template;
};

export const getDocsLayoutTemplate = (id: DocsLayoutId): DocsLayoutTemplate => registry[id] ?? registry.docs;
