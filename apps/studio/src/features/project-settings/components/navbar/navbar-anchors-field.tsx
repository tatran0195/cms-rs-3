import { Button } from '@cms/design-system/components/ui/button';
import { Input } from '@cms/design-system/components/ui/input';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import { Plus, X } from 'lucide-react';
import { FIELD_COMPACT, FIELD_COMPACT_MONO, GroupLabel } from '../shared';
import type { NavbarFormApi } from './types';

export function NavbarAnchorsField({
  form,
  direction,
}: {
  form: NavbarFormApi;
  direction?: 'ltr' | 'rtl';
}) {
  const t = useT();

  return (
    <>
      <GroupLabel className="mt-6 mb-1">{t('settings.navbar.anchors.label')}</GroupLabel>
      <p className="mb-2.5 text-[12px] text-muted-foreground leading-snug">{t('settings.navbar.anchors.hint')}</p>
      <form.Field mode="array" name="anchors">
        {/* biome-ignore lint/suspicious/noExplicitAny: Tanstack Form array field callback */}
        {(field: any) => (
          <>
            {field.state.value.length > 0 ? (
              <div className="mb-3 overflow-hidden rounded-xl border border-border">
                {field.state.value.map((_: unknown, index: number) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and reorder by index
                  <div className="flex items-center gap-2.5 border-border border-b p-3 last:border-b-0" key={index}>
                    <form.Field name={`anchors[${index}].label`}>
                      {/* biome-ignore lint/suspicious/noExplicitAny: subfield */}
                      {(sub: any) => (
                        <Input
                          className={cn(FIELD_COMPACT, 'flex-1')}
                          dir={direction ?? 'auto'}
                          onChange={(e) => sub.handleChange(e.target.value)}
                          placeholder={t('settings.navbar.anchors.labelPlaceholder')}
                          value={sub.state.value}
                        />
                      )}
                    </form.Field>
                    <form.Field name={`anchors[${index}].href`}>
                      {/* biome-ignore lint/suspicious/noExplicitAny: subfield */}
                      {(sub: any) => (
                        <Input
                          className={cn(FIELD_COMPACT_MONO, 'flex-1')}
                          dir="ltr"
                          onChange={(e) => sub.handleChange(e.target.value)}
                          placeholder="https://community.example.com"
                          value={sub.state.value}
                        />
                      )}
                    </form.Field>
                    <form.Field name={`anchors[${index}].icon`}>
                      {/* biome-ignore lint/suspicious/noExplicitAny: subfield */}
                      {(sub: any) => (
                        <Input
                          className={cn(FIELD_COMPACT, 'w-[104px] shrink-0')}
                          dir="ltr"
                          onChange={(e) => sub.handleChange(e.target.value)}
                          placeholder={t('settings.navbar.anchors.iconPlaceholder')}
                          value={sub.state.value}
                        />
                      )}
                    </form.Field>
                    <Button
                      aria-label={t('settings.navbar.anchors.remove')}
                      className="text-muted-foreground"
                      onClick={() => field.removeValue(index)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <Button
              className="mb-1.5 border-dashed text-muted-foreground"
              onClick={() =>
                field.pushValue({
                  label: '',
                  href: '',
                  icon: '',
                  external: undefined,
                })
              }
              type="button"
              variant="outline"
            >
              <Plus className="size-3.5" /> {t('settings.navbar.anchors.add')}
            </Button>
          </>
        )}
      </form.Field>
    </>
  );
}
