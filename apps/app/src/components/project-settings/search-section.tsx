import { PageIcon } from '@/components/site/page-icon';
import type { Language, Project } from '@/hooks/api';
import { useLanguages, useProjectSearchConfiguration, useUpdateLanguage, useUpdateProjectSearchConfiguration } from '@/hooks/api';
import { Button } from '@cms/design-system/components/ui/button';
import { Input } from '@cms/design-system/components/ui/input';
import { Skeleton } from '@cms/design-system/components/ui/skeleton';
import { useT } from '@cms/i18n/react';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useForm } from '@tanstack/react-form';
import { GripVertical, Hash, Plus, RotateCcw, Search, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { IconPicker } from './icon-picker';
import { SearchIndexDiagnostics } from './search-index-diagnostics';
import {
  DirtyStateReporter,
  Field,
  FIELD_INPUT,
  LanguageScopePicker,
  SaveBar,
  SectionHeader,
  Segmented,
  sortLanguagesDefaultFirst,
  ToggleRow,
  useScopeDirtyGuard,
} from './shared';

type Hotkey = 'cmdk' | 'slash';

interface SearchSuggestedQuestion {
  question: string;
  category?: string;
  icon?: string;
}

/** Stable item that carries an id for dnd-kit */
interface SortableQuestion extends SearchSuggestedQuestion {
  id: string;
}

const DEFAULT_SUGGESTED_QUESTIONS: SearchSuggestedQuestion[] = [
  { question: 'What is this documentation about?', category: 'Overview & Introduction', icon: 'sparkles' },
  { question: 'How do I get started?', category: 'Quickstart & Setup', icon: 'rocket' },
  { question: 'What are the core features and guides?', category: 'Architecture & Capabilities', icon: 'layers' },
  { question: 'Where can I find API endpoints and reference?', category: 'Developer Reference', icon: 'code' },
];

/** Per-index accent: left bar */
const ACCENT_LEFT = [
  'bg-violet-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-fuchsia-500',
];

function withIds(questions: SearchSuggestedQuestion[]): SortableQuestion[] {
  return questions.map((q, i) => ({ ...q, id: `q-${i}-${q.question.slice(0, 12)}` }));
}

// ─── Sortable question row ──────────────────────────────────────────────────

function SortableQuestionRow({
  item,
  visualIndex,
  isFocused,
  onFocus,
  onBlur,
  onChange,
  onRemove,
}: {
  item: SortableQuestion;
  visualIndex: number;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (field: 'question' | 'category' | 'icon', value: string | undefined) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const leftBar = ACCENT_LEFT[visualIndex % ACCENT_LEFT.length] ?? 'bg-primary';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-stretch transition-colors duration-100 ${isFocused ? 'bg-muted/25' : 'hover:bg-muted/10'}`}
    >
      {/* Left colour bar */}
      <div
        className={`w-0.5 shrink-0 self-stretch rounded-full transition-opacity duration-150 ${leftBar} ${
          isFocused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      />

      {/* Drag handle */}
      <button
        type="button"
        className="flex cursor-grab touch-none items-center px-2.5 text-muted-foreground/25 hover:text-muted-foreground/70 transition-colors active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      {/* Reusable Icon Picker */}
      <div className="flex items-center py-2.5 pr-2.5">
        <IconPicker
          value={item.icon}
          onChange={(icon) => onChange('icon', icon ?? undefined)}
          fallbackIcon={<Sparkles className="size-3.5 opacity-40 group-hover:opacity-80" />}
          title="Choose question icon"
        />
      </div>

      {/* Inputs */}
      <div className="flex flex-1 flex-col gap-y-0.5 py-2.5 pr-1 sm:flex-row sm:items-center sm:gap-x-2">
        <Input
          value={item.question}
          onChange={(e) => onChange('question', e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="e.g. How do I get started?"
          className="h-8 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/35"
        />
        <div className="flex items-center gap-1 text-muted-foreground/40">
          <Hash className="size-3 shrink-0" />
          <Input
            value={item.category ?? ''}
            onChange={(e) => onChange('category', e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="Category"
            className="h-8 w-32 border-0 bg-transparent px-0 text-xs text-muted-foreground shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/35 sm:w-40"
          />
        </div>
      </div>

      {/* Delete */}
      <div className="flex items-center pe-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="size-7 p-0 text-muted-foreground/30 opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
          title="Remove"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Drag overlay card – rendered outside the list while dragging */
function QuestionDragOverlay({ item, visualIndex }: { item: SortableQuestion; visualIndex: number }) {
  const leftBar = ACCENT_LEFT[visualIndex % ACCENT_LEFT.length] ?? 'bg-primary';
  return (
    <div className="flex items-stretch rounded-lg border border-primary/40 bg-background shadow-xl ring-1 ring-primary/20 opacity-95">
      <div className={`w-0.5 shrink-0 self-stretch rounded-full ${leftBar}`} />
      <div className="flex items-center px-2.5 text-muted-foreground/60">
        <GripVertical className="size-4" />
      </div>
      <div className="flex items-center py-2.5 pr-2.5">
        {item.icon ? <PageIcon name={item.icon} className="size-3.5 text-primary" /> : <Sparkles className="size-3.5 text-primary/60" />}
      </div>
      <div className="flex flex-1 items-center py-2.5 pr-3">
        <span className="text-sm font-medium text-foreground truncate">{item.question || 'Empty question'}</span>
        {item.category ? <span className="ms-2 shrink-0 text-xs text-muted-foreground">#{item.category}</span> : null}
      </div>
    </div>
  );
}

/** Search with a per-language scope */
export function SearchSection({ project }: { project: Project }) {
  const t = useT();
  const { data: languages } = useLanguages(project.id);
  const orderedLanguages = sortLanguagesDefaultFirst(languages ?? []);
  const defaultLanguage = orderedLanguages.find((l) => l.isDefault);
  const extraLanguages = orderedLanguages.filter((l) => !l.isDefault);
  const [scope, setScope] = useState<string>('default');
  const activeLanguage = extraLanguages.find((l) => l.id === scope);
  const { guard, setDirty } = useScopeDirtyGuard();

  return (
    <div>
      <SectionHeader icon={<Search className="size-4" />} title={t('settings.search.title')} />
      <LanguageScopePicker
        defaultLanguage={defaultLanguage}
        guard={guard}
        hint={t('settings.search.scope.hint')}
        languages={extraLanguages}
        onChange={setScope}
        value={scope}
      />
      {activeLanguage ? (
        <LanguageSearchForm key={activeLanguage.id} language={activeLanguage} onDirtyChange={setDirty} project={project} />
      ) : (
        <ProjectSearchForm key="default" onDirtyChange={setDirty} project={project} />
      )}
    </div>
  );
}

function ProjectSearchForm({ project, onDirtyChange }: { project: Project; onDirtyChange?: (dirty: boolean) => void }) {
  const configuration = useProjectSearchConfiguration(project.id);
  if (configuration.isPending) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (configuration.isError || !configuration.data) {
    return <SearchConfigurationError onRetry={() => void configuration.refetch()} />;
  }
  return (
    <>
      <ProjectSearchConfigurationForm
        key={JSON.stringify(configuration.data.configuration)}
        configuration={configuration.data.configuration}
        maxResultsConstraint={configuration.data.constraints.maxResults}
        onDirtyChange={onDirtyChange}
        projectId={project.id}
      />
      <SearchIndexDiagnostics projectId={project.id} />
    </>
  );
}

function SearchConfigurationError({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert">
      <p className="font-medium text-destructive">{t('settings.search.configuration.error')}</p>
      <Button className="mt-2 h-auto p-0 text-xs" onClick={onRetry} size="sm" type="button" variant="link">
        {t('common.retry')}
      </Button>
    </div>
  );
}

function ProjectSearchConfigurationForm({
  projectId,
  configuration,
  maxResultsConstraint,
  onDirtyChange,
}: {
  projectId: string;
  configuration: {
    maxResults: number;
    filtersEnabled: boolean;
    versionFilterEnabled: boolean;
    aiAnswers: boolean;
    hotkey: Hotkey;
    placeholder: string | null;
    suggestedQuestions?: SearchSuggestedQuestion[] | null;
    popularSearches?: Array<string | { label: string; icon?: string }> | null;
  };
  maxResultsConstraint: { default: number; min: number; max: number };
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useT();
  const update = useUpdateProjectSearchConfiguration(projectId);
  const [hotkey, setHotkey] = useState<Hotkey>(configuration.hotkey);
  const [aiAnswers, setAiAnswers] = useState(configuration.aiAnswers ? 'enabled' : 'disabled');
  const [versionFilterEnabled, setVersionFilterEnabled] = useState(configuration.versionFilterEnabled);

  // Questions: give each item a stable id so dnd-kit can track it
  const initQuestions = withIds(configuration.suggestedQuestions?.length ? configuration.suggestedQuestions : DEFAULT_SUGGESTED_QUESTIONS);
  const [questions, setQuestions] = useState<SortableQuestion[]>(initQuestions);
  const [activeQuestion, setActiveQuestion] = useState<SortableQuestion | null>(null);

  const [focusedQuestion, setFocusedQuestion] = useState<number | null>(null);

  // Dirty checks (compare to initial serialised values)
  const initQSerial = JSON.stringify(initQuestions.map((q) => ({ question: q.question, category: q.category, icon: q.icon })));
  const questionsDirty = JSON.stringify(questions.map((q) => ({ question: q.question, category: q.category, icon: q.icon }))) !== initQSerial;

  const controlsDirty =
    hotkey !== configuration.hotkey ||
    (aiAnswers === 'enabled') !== configuration.aiAnswers ||
    versionFilterEnabled !== configuration.versionFilterEnabled ||
    questionsDirty;

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const form = useForm({
    defaultValues: {
      placeholder: configuration.placeholder ?? '',
      maxResults: String(configuration.maxResults),
    },
    onSubmit: async ({ value }) => {
      const parsedMaxResults = Number.parseInt(value.maxResults, 10);
      try {
        await update.mutateAsync({
          hotkey,
          placeholder: value.placeholder.trim() || null,
          maxResults: Number.isFinite(parsedMaxResults)
            ? Math.min(maxResultsConstraint.max, Math.max(maxResultsConstraint.min, parsedMaxResults))
            : maxResultsConstraint.default,
          versionFilterEnabled,
          aiAnswers: aiAnswers === 'enabled',
          suggestedQuestions: questions
            .filter((q) => q.question.trim().length > 0)
            .map(({ question, category, icon }) => ({ question, category, icon: icon || undefined })),
          popularSearches: [],
        });
        toast.success(t('common.saved'));
      } catch {
        toast.error(t('settings.search.configuration.error'));
      }
    },
  });

  // ── Questions DnD handlers ──────────────────────────────────────────────
  const handleQuestionDragStart = (event: DragStartEvent) => {
    const found = questions.find((q) => q.id === event.active.id);
    setActiveQuestion(found ?? null);
  };
  const handleQuestionDragEnd = (event: DragEndEvent) => {
    setActiveQuestion(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setQuestions((items) => {
        const oldIdx = items.findIndex((i) => i.id === active.id);
        const newIdx = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIdx, newIdx);
      });
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.Field name="placeholder">
        {(field) => (
          <Field hint={t('settings.search.placeholder.hint')} label={t('settings.search.placeholder.label')}>
            <Input
              className={FIELD_INPUT}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={t('settings.search.placeholder.input')}
              value={field.state.value}
            />
          </Field>
        )}
      </form.Field>

      <form.Field name="maxResults">
        {(field) => (
          <Field hint={t('settings.search.maxResults.hint')} label={t('settings.search.maxResults.label')}>
            <Input
              className={FIELD_INPUT}
              max={maxResultsConstraint.max}
              min={maxResultsConstraint.min}
              onChange={(e) => field.handleChange(e.target.value)}
              type="number"
              value={field.state.value}
            />
          </Field>
        )}
      </form.Field>

      <Field hint={t('settings.search.hotkey.hint')} label={t('settings.search.hotkey.label')}>
        <Segmented
          className="max-w-[200px] font-mono"
          onChange={setHotkey}
          options={[
            { value: 'cmdk', label: <span dir="ltr">⌘K</span> },
            { value: 'slash', label: <span dir="ltr">/</span> },
          ]}
          value={hotkey}
        />
      </Field>

      <div className="mb-6 rounded-lg border px-4">
        <ToggleRow
          checked={versionFilterEnabled}
          hint={t('settings.search.versionFilters.hint')}
          onCheckedChange={setVersionFilterEnabled}
          title={t('settings.search.versionFilters.label')}
        />
      </div>

      <Field hint={t('settings.search.aiAnswers.hint')} label={t('settings.search.aiAnswers.label')}>
        <Segmented
          className="max-w-[240px]"
          onChange={setAiAnswers}
          options={[
            { value: 'enabled', label: t('settings.search.aiAnswers.enabled') },
            { value: 'disabled', label: t('settings.search.aiAnswers.disabled') },
          ]}
          value={aiAnswers}
        />
      </Field>

      {/* ─── Suggested AI Questions ──────────────────────────────────── */}
      {aiAnswers === 'enabled' ? (
        <div className="mb-6 overflow-hidden rounded-xl border border-border/60 shadow-xs">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                <Sparkles className="size-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight text-foreground">{t('settings.search.suggestedQuestions.label')}</p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{t('settings.search.suggestedQuestions.hint')}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setQuestions(withIds(DEFAULT_SUGGESTED_QUESTIONS))}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3" />
              <span className="hidden sm:inline">{t('settings.search.suggestedQuestions.loadDefaults')}</span>
            </Button>
          </div>

          {/* Sortable rows */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleQuestionDragStart} onDragEnd={handleQuestionDragEnd}>
            <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-border/40 bg-background/60">
                {questions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground/60">{t('settings.search.suggestedQuestions.empty')}</div>
                ) : null}
                {questions.map((item, index) => (
                  <SortableQuestionRow
                    key={item.id}
                    item={item}
                    visualIndex={index}
                    isFocused={focusedQuestion === index}
                    onFocus={() => setFocusedQuestion(index)}
                    onBlur={() => setFocusedQuestion(null)}
                    onChange={(field, value) => {
                      setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, [field]: value } : q)));
                    }}
                    onRemove={() => setQuestions((prev) => prev.filter((_, i) => i !== index))}
                  />
                ))}
              </div>
            </SortableContext>

            {/* Drag overlay — floating ghost card */}
            <DragOverlay adjustScale={false}>
              {activeQuestion ? (
                <QuestionDragOverlay item={activeQuestion} visualIndex={questions.findIndex((q) => q.id === activeQuestion.id)} />
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Add question */}
          {questions.length < 8 ? (
            <div className="border-t border-border/40 bg-muted/20 px-5 py-2.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuestions((prev) => [...prev, { id: `q-${Date.now()}`, question: '', category: '', icon: 'sparkles' }]);
                  setFocusedQuestion(questions.length);
                }}
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Plus className="size-3.5" />
                {t('settings.search.suggestedQuestions.add')}
                <span className="ms-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/60">{questions.length}/8</span>
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <form.Subscribe selector={(state) => state.isDirty}>
        {(isDirty) => <DirtyStateReporter dirty={isDirty || controlsDirty} onDirtyChange={onDirtyChange} />}
      </form.Subscribe>

      <form.Subscribe selector={(state) => [state.isSubmitting, state.isDirty] as const}>
        {([isSubmitting, isDirty]) => <SaveBar disabled={!isDirty && !controlsDirty} isSubmitting={isSubmitting} />}
      </form.Subscribe>
    </form>
  );
}

/** Language scope: localized placeholder override only. */
function LanguageSearchForm({
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
  const projectSearch = project.config?.search ?? {};

  const form = useForm({
    defaultValues: { placeholder: language.config?.search?.placeholder ?? '' },
    onSubmit: async ({ value }) => {
      const placeholder = value.placeholder.trim();
      try {
        await update.mutateAsync({
          id: language.id,
          body: { config: { search: placeholder ? { placeholder } : null } },
        });
        toast.success(t('common.saved'));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('settings.saveError'));
      }
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.Field name="placeholder">
        {(field) => (
          <Field hint={t('settings.search.placeholder.hint')} label={t('settings.search.placeholder.label')}>
            <Input
              className={FIELD_INPUT}
              dir={language.direction === 'RTL' ? 'rtl' : 'ltr'}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={projectSearch.placeholder || t('settings.search.placeholder.input')}
              value={field.state.value}
            />
          </Field>
        )}
      </form.Field>

      <Field hint={t('settings.chrome.scope.globalField')} label={t('settings.search.maxResults.label')}>
        <Input className={FIELD_INPUT} disabled type="number" value={String(projectSearch.maxResults ?? 12)} />
      </Field>
      <Field hint={t('settings.chrome.scope.globalField')} label={t('settings.search.hotkey.label')}>
        <Segmented
          className="max-w-[200px] font-mono"
          disabled
          onChange={() => undefined}
          options={[
            { value: 'cmdk', label: <span dir="ltr">⌘K</span> },
            { value: 'slash', label: <span dir="ltr">/</span> },
          ]}
          value={(projectSearch.hotkey as Hotkey) ?? 'cmdk'}
        />
      </Field>

      <form.Subscribe selector={(state) => state.isDirty}>
        {(isDirty) => <DirtyStateReporter dirty={isDirty} onDirtyChange={onDirtyChange} />}
      </form.Subscribe>

      <form.Subscribe selector={(state) => [state.isSubmitting, state.isDirty] as const}>
        {([isSubmitting, isDirty]) => <SaveBar disabled={!isDirty} isSubmitting={isSubmitting} />}
      </form.Subscribe>
    </form>
  );
}
