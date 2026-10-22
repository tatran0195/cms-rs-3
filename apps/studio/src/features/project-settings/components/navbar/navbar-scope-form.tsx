import { Input } from '@cms/design-system/components/ui/input';
import { useT } from '@cms/i18n/react';
import type { NavTabItem } from '@cms/validators';
import { useForm } from '@tanstack/react-form';
import type { ReactNode } from 'react';
import { DirtyStateReporter, FIELD_INPUT, Field, GroupLabel, SaveBar, ToggleRow } from '../shared';
import { NavbarAnchorsField } from './navbar-anchors-field';
import { NavbarLinksField } from './navbar-links-field';
import type { GlobalNavbarPreview, NavbarValues } from './types';

export function NavbarScopeForm({
  initial,
  onSave,
  showGlobalFields = false,
  extraToggles,
  ctaLabelPlaceholder,
  globalPreview,
  onDirtyChange,
  extraDirty = false,
  direction,
}: {
  initial: NavbarValues;
  direction?: 'ltr' | 'rtl';
  onSave: (value: NavbarValues) => Promise<void>;
  showGlobalFields?: boolean;
  extraToggles?: ReactNode;
  ctaLabelPlaceholder?: string;
  globalPreview?: GlobalNavbarPreview;
  onDirtyChange?: (dirty: boolean) => void;
  extraDirty?: boolean;
}) {
  const t = useT();
  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      await onSave(value);
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.Field name="ctaLabel">
        {(field) => (
          <Field hint={t('settings.navbar.ctaLabel.hint')} label={t('settings.navbar.ctaLabel.label')}>
            <Input
              className={FIELD_INPUT}
              dir={direction ?? 'auto'}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={ctaLabelPlaceholder ?? t('settings.navbar.ctaLabel.placeholder')}
              value={field.state.value}
            />
          </Field>
        )}
      </form.Field>

      {showGlobalFields ? (
        <form.Field name="ctaUrl">
          {(field) => (
            <Field hint={t('settings.navbar.ctaUrl.hint')} label={t('settings.navbar.ctaUrl.label')}>
              <Input
                className={FIELD_INPUT}
                dir="ltr"
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="https://example.com/demo"
                value={field.state.value}
              />
            </Field>
          )}
        </form.Field>
      ) : globalPreview ? (
        <Field hint={t('settings.chrome.scope.globalField')} label={t('settings.navbar.ctaUrl.label')}>
          <Input className={FIELD_INPUT} dir="ltr" disabled placeholder="https://example.com/demo" value={globalPreview.ctaUrl} />
        </Field>
      ) : null}

      <NavbarLinksField direction={direction} form={form} />

      <NavbarAnchorsField direction={direction} form={form} />

      {extraToggles}
      {globalPreview ? (
        <>
          <ToggleRow
            checked={globalPreview.showSearch}
            disabled
            hint={t('settings.chrome.scope.globalField')}
            title={t('settings.navbar.showSearch.title')}
          />
          <ToggleRow
            checked={globalPreview.changelog}
            disabled
            hint={t('settings.chrome.scope.globalField')}
            title={t('settings.navbar.changelog.title')}
          />
        </>
      ) : null}

      <form.Subscribe selector={(state) => state.isDirty}>
        {(isDirty) => <DirtyStateReporter dirty={isDirty || extraDirty} onDirtyChange={onDirtyChange} />}
      </form.Subscribe>

      <div className="mt-4">
        <form.Subscribe selector={(state) => [state.isSubmitting, state.isDirty] as const}>
          {([isSubmitting, isDirty]) => <SaveBar disabled={!isDirty && !extraDirty} isSubmitting={isSubmitting} />}
        </form.Subscribe>
      </div>
    </form>
  );
}
