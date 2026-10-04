import { json, type ThemeRepositoryTemplateOptions } from './types';

const THEME_LABELS = {
  harbor: { en: 'Harbor' },
  manuscript: { en: 'Manuscript' },
  signal: { en: 'Signal' },
} as const;

/** Paraglide chrome strings. Every visible label in the generated app is read
 * through these catalogs. */
export const messagesTemplate = ({ templateId }: ThemeRepositoryTemplateOptions): { en: string } => ({
  en: json({
    themeLabel: THEME_LABELS[templateId].en,
    skipToContent: 'Skip to content',
    search: 'Search documentation',
    searchResults: 'Search results',
    noSearchResults: 'No pages match this search.',
    language: 'Language',
    version: 'Version',
    documentation: 'Documentation',
    chapters: 'Chapters',
    onThisPage: 'On this page',
    previous: 'Previous',
    next: 'Next',
    menu: 'Open navigation',
    closeMenu: 'Close navigation',
    switchToDark: 'Switch to dark mode',
    switchToLight: 'Switch to light mode',
    notFoundTitle: 'Page not found',
    notFoundBody: 'This page does not exist in the selected language or version.',
    backToStart: 'Back to the first page',
    builtWith: 'Built with cms',
  }),
});
