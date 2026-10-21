import { useT } from '@cms/i18n/react';
import type { Project } from '@cms/sdk';
import { useLanguages } from '@cms/sdk/react';
import { PanelTop } from 'lucide-react';
import { useState } from 'react';
import {
  LanguageScopePicker,
  SectionHeader,
  sortLanguagesDefaultFirst,
  useScopeDirtyGuard,
} from '../shared';
import { LanguageNavbarForm } from './language-navbar-form';
import { ProjectNavbarForm } from './project-navbar-form';

export function NavbarSection({ project }: { project: Project }) {
  const t = useT();
  const { data: languages } = useLanguages(project.id);
  const orderedLanguages = sortLanguagesDefaultFirst(languages ?? []);
  const defaultLanguage = orderedLanguages.find((language) => language.isDefault);
  const extraLanguages = orderedLanguages.filter((language) => !language.isDefault);
  const [scope, setScope] = useState<string>('default');
  const activeLanguage = extraLanguages.find((language) => language.id === scope);
  const { guard, setDirty } = useScopeDirtyGuard();

  return (
    <div>
      <SectionHeader icon={<PanelTop className="size-4" />} title={t('settings.navbar.title')} />
      <LanguageScopePicker
        defaultLanguage={defaultLanguage}
        guard={guard}
        hint={t('settings.navbar.scope.hint')}
        languages={extraLanguages}
        onChange={setScope}
        value={scope}
      />
      {/* Keyed per scope so switching re-seeds the form from that scope's config. */}
      {activeLanguage ? (
        <LanguageNavbarForm key={activeLanguage.id} language={activeLanguage} onDirtyChange={setDirty} project={project} />
      ) : (
        <ProjectNavbarForm key="default" onDirtyChange={setDirty} project={project} />
      )}
    </div>
  );
}
