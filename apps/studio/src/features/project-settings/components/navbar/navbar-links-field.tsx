import { Button } from '@cms/design-system/components/ui/button';
import { Input } from '@cms/design-system/components/ui/input';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import { ChevronDown, ChevronRight, ExternalLink, Layers, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { FIELD_COMPACT, FIELD_COMPACT_MONO, GroupLabel } from '../shared';
import type { NavLinkChild, NavbarFormApi } from './types';

/** Child-item row inside an expanded dropdown group */
function LinkChildRow({
  index,
  parentIndex,
  form,
  direction,
  onRemove,
}: {
  index: number;
  parentIndex: number;
  form: NavbarFormApi;
  direction?: 'ltr' | 'rtl';
  onRemove: () => void;
}) {
  const t = useT();
  return (
    // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and reorder by index
    <div className="grid gap-1.5 p-2.5 border-border/60 border-t" key={index}>
      <div className="flex items-center gap-2">
        <form.Field name={`links[${parentIndex}].items[${index}].label`}>
          {(sub: any) => (
            <Input
              className={cn(FIELD_COMPACT, 'flex-1 min-w-[100px]')}
              dir={direction ?? 'auto'}
              onChange={(e) => sub.handleChange(e.target.value)}
              placeholder={t('settings.navbar.links.labelPlaceholder')}
              value={sub.state.value}
            />
          )}
        </form.Field>
        <form.Field name={`links[${parentIndex}].items[${index}].href`}>
          {(sub: any) => (
            <Input
              className={cn(FIELD_COMPACT_MONO, 'flex-1 min-w-[100px]')}
              dir="ltr"
              onChange={(e) => sub.handleChange(e.target.value)}
              placeholder="/docs/guide"
              value={sub.state.value}
            />
          )}
        </form.Field>
        <form.Field name={`links[${parentIndex}].items[${index}].external`}>
          {(sub: any) => (
            <Button
              aria-label={sub.state.value ? 'External link enabled' : 'External link disabled'}
              className={cn(
                'size-7 shrink-0 text-xs',
                sub.state.value
                  ? 'border border-primary/30 bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => sub.handleChange(!sub.state.value)}
              size="icon-xs"
              title="Open in new window (external)"
              type="button"
              variant="ghost"
            >
              <ExternalLink className="size-3.5" />
            </Button>
          )}
        </form.Field>
        <Button
          aria-label={t('settings.navbar.links.remove')}
          className="text-muted-foreground"
          onClick={onRemove}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="flex gap-2">
        <form.Field name={`links[${parentIndex}].items[${index}].icon`}>
          {(sub: any) => (
            <Input
              className={cn(FIELD_COMPACT, 'w-[110px] shrink-0')}
              dir="ltr"
              onChange={(e) => sub.handleChange(e.target.value)}
              placeholder="BookOpen"
              title="Lucide icon name"
              value={sub.state.value ?? ''}
            />
          )}
        </form.Field>
        <form.Field name={`links[${parentIndex}].items[${index}].description`}>
          {(sub: any) => (
            <Input
              className={cn(FIELD_COMPACT, 'flex-1')}
              dir={direction ?? 'auto'}
              onChange={(e) => sub.handleChange(e.target.value)}
              placeholder="Short description shown in dropdown"
              value={sub.state.value ?? ''}
            />
          )}
        </form.Field>
      </div>
    </div>
  );
}

/** Single top-level link row — either a plain link or a dropdown group */
function LinkRow({
  index,
  form,
  direction,
  onRemove,
}: {
  index: number;
  form: NavbarFormApi;
  direction?: 'ltr' | 'rtl';
  onRemove: () => void;
}) {
  const t = useT();
  const [childrenExpanded, setChildrenExpanded] = useState(true);

  return (
    <form.Field mode="array" name={`links[${index}].items`}>
      {(itemsField: any) => {
        const items: NavLinkChild[] = itemsField.state.value ?? [];
        const isDropdown = items.length > 0;

        const toggleDropdownMode = () => {
          if (isDropdown) {
            // Collapse to plain link — remove all children
            itemsField.setValue([]);
          } else {
            // Expand to dropdown — add first child
            itemsField.setValue([{ label: '', href: '', external: undefined, icon: '', description: '' }]);
            setChildrenExpanded(true);
          }
        };

        return (
          <div className="overflow-hidden rounded-lg border border-border/70 bg-card/60">
            {/* Parent row */}
            <div className="flex flex-wrap items-center gap-2 p-2.5">
              {/* Expand/collapse toggle for children */}
              {isDropdown && (
                <Button
                  aria-label={childrenExpanded ? 'Collapse dropdown' : 'Expand dropdown'}
                  className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setChildrenExpanded(!childrenExpanded)}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  {childrenExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </Button>
              )}

              {/* Label */}
              <form.Field name={`links[${index}].label`}>
                {(sub: any) => (
                  <Input
                    className={cn(FIELD_COMPACT, 'min-w-[100px] flex-1')}
                    dir={direction ?? 'auto'}
                    onChange={(e) => sub.handleChange(e.target.value)}
                    placeholder={t('settings.navbar.links.labelPlaceholder')}
                    value={sub.state.value}
                  />
                )}
              </form.Field>

              {/* href — optional for dropdown groups */}
              <form.Field name={`links[${index}].href`}>
                {(sub: any) => (
                  <Input
                    className={cn(FIELD_COMPACT_MONO, 'min-w-[100px] flex-1')}
                    dir="ltr"
                    onChange={(e) => sub.handleChange(e.target.value)}
                    placeholder={isDropdown ? '(Optional group URL)' : '/docs'}
                    value={sub.state.value ?? ''}
                  />
                )}
              </form.Field>

              {/* External toggle — only for plain links */}
              {!isDropdown && (
                <form.Field name={`links[${index}].external`}>
                  {(sub: any) => (
                    <Button
                      aria-label={sub.state.value ? 'External link enabled' : 'External link disabled'}
                      className={cn(
                        'size-7 shrink-0 text-xs',
                        sub.state.value
                          ? 'border border-primary/30 bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      onClick={() => sub.handleChange(!sub.state.value)}
                      size="icon-xs"
                      title="Open in new window (external)"
                      type="button"
                      variant="ghost"
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                  )}
                </form.Field>
              )}

              {/* Dropdown toggle */}
              <Button
                aria-label={isDropdown ? 'Convert to plain link' : 'Convert to dropdown collection'}
                className={cn(
                  'size-7 shrink-0 text-xs',
                  isDropdown
                    ? 'border border-primary/30 bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={toggleDropdownMode}
                size="icon-xs"
                title={isDropdown ? 'Remove dropdown (plain link)' : 'Add dropdown children'}
                type="button"
                variant="ghost"
              >
                <Layers className="size-3.5" />
              </Button>

              {/* Remove row */}
              <Button
                aria-label={t('settings.navbar.links.remove')}
                className="text-muted-foreground"
                onClick={onRemove}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* Children */}
            {isDropdown && childrenExpanded && (
              <div className="bg-muted/30">
                {items.map((_: unknown, childIndex: number) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                  <LinkChildRow
                    direction={direction}
                    form={form}
                    index={childIndex}
                    key={childIndex}
                    onRemove={() => itemsField.removeValue(childIndex)}
                    parentIndex={index}
                  />
                ))}
                <div className="px-2.5 py-2 border-border/60 border-t">
                  <Button
                    className="h-7 border-dashed text-muted-foreground text-xs"
                    onClick={() => itemsField.pushValue({ label: '', href: '', external: undefined, icon: '', description: '' })}
                    type="button"
                    variant="outline"
                  >
                    <Plus className="size-3 me-1" /> Add child link
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      }}
    </form.Field>
  );
}

export function NavbarLinksField({ form, direction }: { form: NavbarFormApi; direction?: 'ltr' | 'rtl' }) {
  const t = useT();

  return (
    <>
      <GroupLabel className="mb-2.5">{t('settings.navbar.links.label')}</GroupLabel>
      <form.Field mode="array" name="links">
        {(field: any) => (
          <>
            {field.state.value.length > 0 ? (
              <div className="mb-3 space-y-2">
                {field.state.value.map((_: unknown, index: number) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                  <LinkRow
                    direction={direction}
                    form={form}
                    index={index}
                    key={index}
                    onRemove={() => field.removeValue(index)}
                  />
                ))}
              </div>
            ) : null}
            <Button
              className="mb-1.5 border-dashed text-muted-foreground"
              onClick={() => field.pushValue({ label: '', href: '', external: undefined, items: undefined })}
              type="button"
              variant="outline"
            >
              <Plus className="size-3.5" /> {t('settings.navbar.links.add')}
            </Button>
          </>
        )}
      </form.Field>
    </>
  );
}
