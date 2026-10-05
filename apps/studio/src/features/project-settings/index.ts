export { ProjectSettingsPage, type ProjectSettingsPageProps, type SectionId, type SettingsGroupId, isSectionId } from './ProjectSettingsPage';
export { WorkspaceSettingsPage, type WorkspaceSettingsPageProps, type WorkspaceSettingsTab, isWorkspaceSettingsTab } from './WorkspaceSettingsPage';

// Re-export common section components
export { AddonsSection } from './components/addons-section';
export { AuthenticationSection } from './components/authentication-section';
export { DangerSection } from './components/danger-section';
export { DomainSection } from './components/domain-section';
export { GeneralSection } from './components/general-section';
export { LanguagesSection } from './components/languages-section';
export { MembersSection } from './components/members-section';
export { OpenApiSection } from './components/openapi-section';
export { SearchSection } from './components/search-section';
export { ThemeSection } from './components/theme-section';
export { BrandingSection } from './components/branding-section';
export { StylingSection } from './components/styling-section';
export { NavbarSection } from './components/navbar-section';
export { FooterSection } from './components/footer-section';
export { BannerSection } from './components/banner-section';
export { SeoSection } from './components/seo-section';
export { TypographySection } from './components/typography-section';
export { RedirectsSection } from './components/redirects-section';
export { VariablesSection } from './components/variables-section';

export { AccountTab } from './components/account-tab';
export { AppearanceTab } from './components/appearance-tab';
export { ApiKeysTab } from './components/api-keys-tab';
export { GitTab } from './components/git-tab';
export { GitWorkflow } from './components/git-workflow';
export { ImportTab } from './components/import-tab';
export { IntegrationsTab } from './components/integrations-tab';
export { NotificationsTab } from './components/notifications-tab';
export { UsageTab } from './components/usage-tab';
export * from './services/settings-api';
