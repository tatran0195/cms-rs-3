import { DocsStandardLayoutTemplate } from './docs-layout';
import { NotebookLayoutTemplate } from './notebook-layout';

export * from './types';
export * from './shared';
export { DocsStandardLayoutTemplate } from './docs-layout';
export { NotebookLayoutTemplate } from './notebook-layout';

const stubTemplate = (id: DocsLayoutId): DocsLayoutTemplate => ({
  id,
  ReaderLayout: (slots) => slots.content,
  ProjectPreviewLayout: (slots) => slots.content,
  StudioPreviewLayout: (slots) => slots.content,
  PageLayout: (slots) => slots.article,
});

const registry: Record<DocsLayoutId, DocsLayoutTemplate> = {
  docs: DocsStandardLayoutTemplate,
  notebook: NotebookLayoutTemplate,
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
