import type { DocsLayoutId } from '@cms/shared/themes';
import type { DocsLayoutTemplate } from './types';

export * from './types';
export * from './shared';

const stubTemplate = (id: DocsLayoutId): DocsLayoutTemplate => ({
  id,
  ReaderLayout: (slots) => slots.content,
  ProjectPreviewLayout: (slots) => slots.content,
  StudioPreviewLayout: (slots) => slots.content,
  PageLayout: (slots) => slots.article,
});

const registry: Record<DocsLayoutId, DocsLayoutTemplate> = {
  docs: stubTemplate('docs'),
  notebook: stubTemplate('notebook'),
  glass: stubTemplate('glass'),
  flux: stubTemplate('flux'),
  spacious: stubTemplate('spacious'),
};

export const registerDocsLayoutTemplate = (id: DocsLayoutId, template: DocsLayoutTemplate): void => {
  registry[id] = template;
};

export const getDocsLayoutTemplate = (id: DocsLayoutId): DocsLayoutTemplate => {
  return registry[id] ?? registry.docs;
};
