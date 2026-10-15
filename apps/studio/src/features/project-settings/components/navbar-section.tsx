import { Button } from '@cms/design-system/components/ui/button';
import { Input } from '@cms/design-system/components/ui/input';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import type { LanguageConfig, NavTabItem } from '@cms/validators';
import { useForm } from '@tanstack/react-form';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CornerDownRight,
  ExternalLink,
  PanelTop,
  Plus,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Language, Project } from '@cms/sdk';
import { useLanguages, useUpdateLanguage, useUpdateProjectConfig } from '@cms/sdk/react';
import {
  cleanTabItems,
  insertTabChild,
  moveTabNode,
  removeTabNode,
  updateTabNode,
} from './tabs-tree-utils';
import {
  DirtyStateReporter,
  FIELD_COMPACT,
  FIELD_COMPACT_MONO,
  FIELD_INPUT,
  Field,
  GroupLabel,
  LanguageScopePicker,
  SaveBar,
  SectionHeader,
  saveConfigSection,
  sortLanguagesDefaultFirst,
  ToggleRow,
  useScopeDirtyGuard,
} from './shared';

interface NavRow {
  label: string;
  href: string;
  external?: boolean;
}
interface AnchorRow extends NavRow {
  icon: string;
}

/** Prevent TanStack Form DeepKeys infinite recursion by breaking the cycle in the form state type: */
export type FormNavTabItem = Omit<NavTabItem, 'items'> & {
  items?: any[];
};

/** The editable navbar values shared by the project scope and a language scope.
 *  Language scopes localize labels/links only — the CTA URL and the search /
 *  changelog toggles stay global (project scope). */
interface NavbarValues {
  ctaLabel: string;
  ctaUrl: string;
  links: NavRow[];
  tabs: FormNavTabItem[];
  anchors: AnchorRow[];
}

/** Navbar with a per-language scope: "Default" edits `project.config.navbar`
 *  exactly as before; a language scope edits that language's `config.navbar`
 *  override (labels/links shown to visitors browsing that language). */
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

const cleanRows = (rows: NavRow[]): Array<{ label: string; href: string; external?: boolean }> =>
  rows
    .filter((row) => row.label.trim() || row.href.trim())
    .map((row) => ({
      label: row.label,
      href: row.href,
      external: row.external,
    }));

const cleanAnchorRows = (rows: AnchorRow[]): Array<{ label: string; href: string; icon?: string; external?: boolean }> =>
  rows
    .filter((row) => row.label.trim() || row.href.trim())
    .map((row) => ({
      label: row.label,
      href: row.href,
      icon: row.icon.trim() || undefined,
      external: row.external,
    }));

const normalizeTabs = (items?: unknown[]): NavTabItem[] =>
  (items ?? []).map((tab: any) => ({
    label: typeof tab?.label === 'string' ? tab.label : '',
    href: typeof tab?.href === 'string' ? tab.href : '',
    external: Boolean(tab?.external),
    items: Array.isArray(tab?.items) && tab.items.length > 0 ? normalizeTabs(tab.items) : undefined,
  }));

/** Default scope: the project-level navbar in `project.config.navbar` (unchanged). */
function ProjectNavbarForm({ project, onDirtyChange }: { project: Project; onDirtyChange?: (dirty: boolean) => void }) {
  const t = useT();
  const update = useUpdateProjectConfig(project.id);
  const navbar = project.config?.navbar ?? {};
  const [showSearch, setShowSearch] = useState<boolean>(navbar.showSearch ?? true);
  const [showChangelog, setShowChangelog] = useState<boolean>(navbar.changelog ?? false);

  return (
    <NavbarScopeForm
      extraDirty={showSearch !== (navbar.showSearch ?? true) || showChangelog !== (navbar.changelog ?? false)}
      onDirtyChange={onDirtyChange}
      extraToggles={
        <>
          <ToggleRow
            checked={showSearch}
            hint={t('settings.navbar.showSearch.hint')}
            onCheckedChange={setShowSearch}
            title={t('settings.navbar.showSearch.title')}
          />
          <ToggleRow
            checked={showChangelog}
            hint={t('settings.navbar.changelog.hint')}
            onCheckedChange={setShowChangelog}
            title={t('settings.navbar.changelog.title')}
          />
        </>
      }
      initial={{
        ctaLabel: navbar.ctaLabel ?? '',
        ctaUrl: navbar.ctaUrl ?? '',
        links: (navbar.links ?? []).map((link) => ({
          label: link.label,
          href: link.href,
          external: link.external,
        })),
        tabs: normalizeTabs(navbar.tabs),
        anchors: (navbar.anchors ?? []).map((anchor) => ({
          label: anchor.label,
          href: anchor.href,
          icon: anchor.icon ?? '',
          external: anchor.external,
        })),
      }}
      onSave={(value) =>
        saveConfigSection(update, {
          navbar: {
            ctaLabel: value.ctaLabel.trim() || undefined,
            ctaUrl: value.ctaUrl.trim() || undefined,
            links: cleanRows(value.links),
            tabs: cleanTabItems(value.tabs as NavTabItem[]),
            anchors: cleanAnchorRows(value.anchors),
            showSearch,
            changelog: showChangelog,
          },
        })
      }
      showGlobalFields
    />
  );
}

/** A language scope: that language's `config.navbar` override, saved via
 *  updateLanguage. The override always carries the FULL section (only the
 *  non-empty pieces); when every field is empty it is cleared with `null` so
 *  the language falls back to the project navbar. The server merge preserves
 *  the language's name/description/seo untouched. */
function LanguageNavbarForm({
  project,
  language,
  onDirtyChange,
}: {
  project: Project;
  language: Language;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useT();
  const update = useUpdateLanguage(project.id);
  const override: NonNullable<LanguageConfig['navbar']> = language.config?.navbar ?? {};

  return (
    <NavbarScopeForm
      ctaLabelPlaceholder={project.config?.navbar?.ctaLabel || undefined}
      direction={language.direction === 'RTL' ? 'rtl' : 'ltr'}
      globalPreview={{
        ctaUrl: project.config?.navbar?.ctaUrl ?? '',
        showSearch: project.config?.navbar?.showSearch ?? true,
        changelog: project.config?.navbar?.changelog ?? false,
      }}
      onDirtyChange={onDirtyChange}
      initial={{
        ctaLabel: override.ctaLabel ?? '',
        ctaUrl: '',
        links: (override.links ?? []).map((link) => ({
          label: link.label,
          href: link.href,
          external: link.external,
        })),
        tabs: normalizeTabs(override.tabs),
        anchors: (override.anchors ?? []).map((anchor) => ({
          label: anchor.label,
          href: anchor.href,
          icon: anchor.icon ?? '',
          external: anchor.external,
        })),
      }}
      onSave={async (value) => {
        const navbar: NonNullable<LanguageConfig['navbar']> = {};
        if (value.ctaLabel.trim()) {
          navbar.ctaLabel = value.ctaLabel.trim();
        }
        const links = cleanRows(value.links);
        if (links.length > 0) {
          navbar.links = links;
        }
        const tabs = cleanTabItems(value.tabs as NavTabItem[]);
        if (tabs.length > 0) {
          navbar.tabs = tabs;
        }
        const anchors = cleanAnchorRows(value.anchors);
        if (anchors.length > 0) {
          navbar.anchors = anchors;
        }
        try {
          await update.mutateAsync({
            id: language.id,
            body: {
              config: {
                navbar: Object.keys(navbar).length > 0 ? navbar : null,
              },
            },
          });
          toast.success(t('common.saved'));
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t('settings.saveError'));
        }
      }}
    />
  );
}

interface TabTreeNodeProps {
  item: NavTabItem;
  path: number[];
  depth: number;
  isFirst: boolean;
  isLast: boolean;
  direction?: 'ltr' | 'rtl';
  tree: NavTabItem[];
  onChange: (next: NavTabItem[]) => void;
}

function TabTreeNodeItem({
  item,
  path,
  depth,
  isFirst,
  isLast,
  direction,
  tree,
  onChange,
}: TabTreeNodeProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(true);
  const hasChildren = Boolean(item.items && item.items.length > 0);

  const handleUpdate = (patch: Partial<NavTabItem>) => {
    onChange(updateTabNode(tree, path, patch));
  };

  const handleAddChild = () => {
    onChange(insertTabChild(tree, path, { label: '', href: '' }));
    setExpanded(true);
  };

  const handleRemove = () => {
    onChange(removeTabNode(tree, path));
  };

  const handleMove = (dir: 'up' | 'down') => {
    onChange(moveTabNode(tree, path, dir));
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card/60 p-2 text-xs transition-colors hover:border-border">
        {/* Expand / collapse or bullet spacer */}
        {hasChildren ? (
          <Button
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </Button>
        ) : (
          <span className="grid size-6 shrink-0 place-items-center font-bold text-muted-foreground/40">
            •
          </span>
        )}

        {/* Depth Badge */}
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          L{depth + 1}
        </span>

        {/* Label Input */}
        <Input
          className={cn(FIELD_COMPACT, 'min-w-[130px] flex-1')}
          dir={direction ?? 'auto'}
          onChange={(e) => handleUpdate({ label: e.target.value })}
          placeholder={t('settings.navbar.tabs.labelPlaceholder')}
          value={item.label}
        />

        {/* URL Input */}
        <Input
          className={cn(FIELD_COMPACT_MONO, 'min-w-[140px] flex-1')}
          dir="ltr"
          onChange={(e) => handleUpdate({ href: e.target.value })}
          placeholder={hasChildren ? '(Optional for group)' : '/guides'}
          value={item.href ?? ''}
        />

        {/* External Link Toggle */}
        <Button
          aria-label={item.external ? 'External link enabled' : 'External link disabled'}
          className={cn(
            'size-7 shrink-0 text-xs',
            item.external ? 'border border-primary/30 bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => handleUpdate({ external: !item.external })}
          size="icon-xs"
          title="Open in new window (external)"
          type="button"
          variant="ghost"
        >
          <ExternalLink className="size-3.5" />
        </Button>

        {/* Actions: Add sub-tab, move up/down, remove */}
        <div className="flex items-center gap-0.5 border-border/50 border-s ps-1.5">
          <Button
            aria-label="Add sub-tab"
            className="h-7 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={handleAddChild}
            size="sm"
            title="Add sub-tab"
            type="button"
            variant="ghost"
          >
            <CornerDownRight className="me-1 size-3" />
            <span>Sub-tab</span>
          </Button>

          <Button
            aria-label="Move up"
            className="size-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
            disabled={isFirst}
            onClick={() => handleMove('up')}
            size="icon-xs"
            title="Move up"
            type="button"
            variant="ghost"
          >
            <ChevronUp className="size-3.5" />
          </Button>

          <Button
            aria-label="Move down"
            className="size-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
            disabled={isLast}
            onClick={() => handleMove('down')}
            size="icon-xs"
            title="Move down"
            type="button"
            variant="ghost"
          >
            <ChevronDown className="size-3.5" />
          </Button>

          <Button
            aria-label={t('settings.navbar.tabs.remove')}
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={handleRemove}
            size="icon-xs"
            title="Remove tab"
            type="button"
            variant="ghost"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Recursive Children rendering */}
      {hasChildren && expanded && (
        <div className="mt-1.5 ms-4 space-y-1.5 border-border/60 border-s ps-3">
          {item.items?.map((child, index) => (
            <TabTreeNodeItem
              depth={depth + 1}
              direction={direction}
              isFirst={index === 0}
              isLast={index === (item.items?.length ?? 1) - 1}
              item={child}
              key={index}
              onChange={onChange}
              path={[...path, index]}
              tree={tree}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TabsTreeEditor({
  value,
  onChange,
  direction,
}: {
  value: NavTabItem[];
  onChange: (next: NavTabItem[]) => void;
  direction?: 'ltr' | 'rtl';
}) {
  const t = useT();

  const handleAddRoot = () => {
    onChange([...value, { label: '', href: '' }]);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="space-y-2 overflow-hidden rounded-xl border border-border/80 bg-muted/20 p-2.5">
          {value.map((item, index) => (
            <TabTreeNodeItem
              depth={0}
              direction={direction}
              isFirst={index === 0}
              isLast={index === value.length - 1}
              item={item}
              key={index}
              onChange={onChange}
              path={[index]}
              tree={value}
            />
          ))}
        </div>
      ) : null}
      <Button
        className="mb-1.5 border-dashed text-muted-foreground"
        onClick={handleAddRoot}
        type="button"
        variant="outline"
      >
        <Plus className="size-3.5" /> {t('settings.navbar.tabs.add')}
      </Button>
    </div>
  );
}

/** The shared navbar field set (CTA, links, tabs, anchors) with the section's
 *  single SaveBar — one instance per active scope. Global-only fields (CTA URL,
 *  toggles) are editable in the project scope; in a language scope they stay
 *  visible but disabled (`globalPreview`) so the form always reads complete. */
function NavbarScopeForm({
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
  /** Writing direction of the scoped language; text fields fall back to dir="auto" in the project scope. */
  direction?: 'ltr' | 'rtl';
  onSave: (value: NavbarValues) => Promise<void>;
  showGlobalFields?: boolean;
  extraToggles?: React.ReactNode;
  ctaLabelPlaceholder?: string;
  /** Language scopes: the project-level values of the global-only fields,
   *  shown disabled with a "edit in the Default scope" hint. */
  globalPreview?: { ctaUrl: string; showSearch: boolean; changelog: boolean };
  onDirtyChange?: (dirty: boolean) => void;
  /** Dirtiness of scope state held outside the form (the project scope's toggles). */
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

      <GroupLabel className="mb-2.5">{t('settings.navbar.links.label')}</GroupLabel>
      <form.Field mode="array" name="links">
        {(field) => (
          <>
            {field.state.value.length > 0 ? (
              <div className="mb-3 overflow-hidden rounded-xl border border-border">
                {field.state.value.map((_, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and reorder by index
                  <div className="flex items-center gap-2.5 border-border border-b p-3 last:border-b-0" key={index}>
                    <form.Field name={`links[${index}].label`}>
                      {(sub) => (
                        <Input
                          className={cn(FIELD_COMPACT, 'flex-1')}
                          dir={direction ?? 'auto'}
                          onChange={(e) => sub.handleChange(e.target.value)}
                          placeholder={t('settings.navbar.links.labelPlaceholder')}
                          value={sub.state.value}
                        />
                      )}
                    </form.Field>
                    <form.Field name={`links[${index}].href`}>
                      {(sub) => (
                        <Input
                          className={cn(FIELD_COMPACT_MONO, 'flex-1')}
                          dir="ltr"
                          onChange={(e) => sub.handleChange(e.target.value)}
                          placeholder="/docs"
                          value={sub.state.value}
                        />
                      )}
                    </form.Field>
                    <Button
                      aria-label={t('settings.navbar.links.remove')}
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
              onClick={() => field.pushValue({ label: '', href: '', external: undefined })}
              type="button"
              variant="outline"
            >
              <Plus className="size-3.5" /> {t('settings.navbar.links.add')}
            </Button>
          </>
        )}
      </form.Field>

      <GroupLabel className="mt-6 mb-1">{t('settings.navbar.tabs.label')}</GroupLabel>
      <p className="mb-2.5 text-[12px] text-muted-foreground leading-snug">{t('settings.navbar.tabs.hint')}</p>
      <form.Field name="tabs">
        {(field) => (
          <TabsTreeEditor
            direction={direction}
            onChange={(next) => field.handleChange(next)}
            value={field.state.value as NavTabItem[]}
          />
        )}
      </form.Field>

      <GroupLabel className="mt-6 mb-1">{t('settings.navbar.anchors.label')}</GroupLabel>
      <p className="mb-2.5 text-[12px] text-muted-foreground leading-snug">{t('settings.navbar.anchors.hint')}</p>
      <form.Field mode="array" name="anchors">
        {(field) => (
          <>
            {field.state.value.length > 0 ? (
              <div className="mb-3 overflow-hidden rounded-xl border border-border">
                {field.state.value.map((_, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and reorder by index
                  <div className="flex items-center gap-2.5 border-border border-b p-3 last:border-b-0" key={index}>
                    <form.Field name={`anchors[${index}].label`}>
                      {(sub) => (
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
                      {(sub) => (
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
                      {(sub) => (
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
