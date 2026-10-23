export interface DemoTreePage {
  type: 'page';
  name: string;
  path: string;
  description: string;
  icon?: string;
  headings: Array<{ id: string; text: string; depth: number }>;
}

export interface DemoTreeSeparator {
  type: 'separator';
  name: string;
}

export interface DemoTreeFolder {
  type: 'folder';
  name: string;
  description?: string;
  root?: boolean;
  defaultOpen?: boolean;
  icon?: string;
  children: Array<DemoTreeNode>;
}

export type DemoTreeNode = DemoTreePage | DemoTreeSeparator | DemoTreeFolder;

export interface DemoTreeRoot {
  name: string;
  children: DemoTreeNode[];
}

const DEFAULT_HEADINGS = [
  { id: 'introduction', text: 'Introduction', depth: 2 },
  { id: 'installation', text: 'Installation', depth: 2 },
  { id: 'usage', text: 'Usage', depth: 2 },
  { id: 'configuration', text: 'Configuration', depth: 3 },
  { id: 'deployment', text: 'Deployment', depth: 2 },
];

export function createDemoTree(basePath = ''): DemoTreeRoot {
  const normalizePath = (p: string) => {
    if (!basePath) return p;
    return p ? `${basePath}/${p}` : basePath;
  };

  const page = (name: string, path: string, description: string, icon?: string, headings = DEFAULT_HEADINGS): DemoTreePage => ({
    type: 'page',
    name,
    path: normalizePath(path),
    description,
    icon,
    headings,
  });

  return {
    name: 'Docs',
    children: [
      {
        type: 'folder',
        name: 'Framework',
        description: 'Build your documentation site',
        root: true,
        icon: 'Book',
        children: [
          { type: 'separator', name: 'Introduction' },
          page('Overview', '', 'Live documentation architecture preview with interactive component customization.', 'Book'),
          page('Quick Start', 'quick-start', 'Create your first docs site in minutes.', 'Rocket', [
            { id: 'quick-start', text: 'Quick Start', depth: 2 },
            { id: 'install-dependencies', text: 'Install Dependencies', depth: 3 },
            { id: 'choose-layout', text: 'Choose Layout', depth: 3 },
          ]),
          page('Themes', 'themes', 'Customize the colors, typography, and look of your site.', 'Palette', [
            { id: 'themes', text: 'Themes', depth: 2 },
            { id: 'color-tokens', text: 'Color Tokens', depth: 3 },
            { id: 'dark-mode', text: 'Dark Mode', depth: 3 },
          ]),
          { type: 'separator', name: 'Components' },
          {
            type: 'folder',
            name: 'Components',
            icon: 'Layers',
            children: [
              page('Callout', 'components/callout', 'Highlight important notices, tips, and warnings.', 'Info', [
                { id: 'callout-component', text: 'Callout Component', depth: 2 },
                { id: 'callout-variants', text: 'Callout Variants', depth: 3 },
              ]),
              page('Cards', 'components/cards', 'Feature grids, link hubs, and call-to-actions.', 'Folder', [
                { id: 'cards-component', text: 'Cards Component', depth: 2 },
                { id: 'card-grids', text: 'Card Grids', depth: 3 },
              ]),
              page('Tabs', 'components/tabs', 'Switch between packages, languages, or alternatives.', 'Folder', [
                { id: 'tabs-component', text: 'Tabs Component', depth: 2 },
                { id: 'code-tabs', text: 'Code Tabs', depth: 3 },
              ]),
            ],
          },
          { type: 'separator', name: 'Deployment' },
          page('Static Export', 'deployment/static', 'Export your docs as pre-rendered static HTML.', 'Server', [
            { id: 'static-export', text: 'Static Export', depth: 2 },
          ]),
        ],
      },
      {
        type: 'folder',
        name: 'API Reference',
        description: 'Endpoints and OpenAPI integration',
        root: true,
        icon: 'Server',
        children: [
          page('Introduction', 'api', 'Get started with the developer API.', 'Terminal', [
            { id: 'api-overview', text: 'API Overview', depth: 2 },
            { id: 'authentication', text: 'Authentication', depth: 3 },
          ]),
          page('Authentication', 'api/authentication', 'Authorize API requests with Bearer tokens.', 'Layers', [
            { id: 'auth-tokens', text: 'Auth Tokens', depth: 2 },
          ]),
        ],
      },
    ],
  };
}

export function findDemoPage(nodes: DemoTreeNode[], path: string): DemoTreePage | undefined {
  const normalized = path.replace(/^\/+|\/+$/g, '');
  let overviewFallback: DemoTreePage | undefined;

  function walk(items: DemoTreeNode[]): DemoTreePage | undefined {
    for (const item of items) {
      if (item.type === 'page') {
        if (item.path === normalized) return item;
        if (item.path === '' && !overviewFallback) overviewFallback = item;
      }
      if (item.type === 'folder') {
        const found = walk(item.children);
        if (found) return found;
      }
    }
    return undefined;
  }

  return walk(nodes) ?? overviewFallback;
}
