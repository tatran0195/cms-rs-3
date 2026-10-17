import { Badge } from '@cms/design-system/components/ui/badge';
import { Button } from '@cms/design-system/components/ui/button';
import { Input } from '@cms/design-system/components/ui/input';
import { Label } from '@cms/design-system/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cms/design-system/components/ui/select';
import { Switch } from '@cms/design-system/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cms/design-system/components/ui/table';
import type { MessageKey } from '@cms/i18n';
import { useLocale } from '@cms/i18n/react';
import type { ExportArtifact, ExportFormat, ExportJob, ExportSchedule } from '@cms/sdk';
import {
  useCreateExportJob,
  useCreateExportSchedule,
  useDeleteExportSchedule,
  useGetExportDownload,
  useListExportJobs,
  useListExportSchedules,
  useRunExportSchedule,
  useUpdateExportSchedule,
} from '@cms/sdk/react';
import { Archive, Download, FileArchive, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { localeTag, useFormatters } from '@/shared';
import { SectionHeader } from './shared';

export type WorkflowFormat = 'MARKDOWN' | 'PDF' | 'STATIC_HTML' | 'SQLITE' | ExportFormat;

const labelKeys: Record<string, MessageKey> = {
  MARKDOWN: 'settings.exports.workflow.format.markdown',
  PDF: 'settings.exports.workflow.format.pdf',
  STATIC_HTML: 'settings.exports.workflow.format.html',
  SQLITE: 'settings.exports.workflow.format.sqlite',
  markdown: 'settings.exports.workflow.format.markdown',
  pdf: 'settings.exports.workflow.format.pdf',
  html: 'settings.exports.workflow.format.html',
  sqlite: 'settings.exports.workflow.format.sqlite',
};

const selectableFormats: WorkflowFormat[] = ['MARKDOWN', 'PDF', 'STATIC_HTML', 'SQLITE'];
const MEBIBYTE = 1024 * 1024;
const formatDate = (date: string | null | undefined, locale: string) => (date ? new Date(date).toLocaleString(localeTag(locale)) : '—');

export function ExportsSection({ projectId }: { projectId: string }) {
  const { locale, t } = useLocale();
  const { number } = useFormatters();
  const sizeLabel = (bytes: number) =>
    bytes >= MEBIBYTE * 1024
      ? t('settings.usage.unit.gb', { value: number(bytes / MEBIBYTE / 1024, { maximumFractionDigits: 1 }) })
      : t('settings.usage.unit.mb', { value: number(bytes / MEBIBYTE, { maximumFractionDigits: bytes < MEBIBYTE ? 2 : 1 }) });

  const [formats, setFormats] = useState<WorkflowFormat[]>(['MARKDOWN']);
  const [showSchedule, setShowSchedule] = useState(false);
  const [surface, setSurface] = useState<'create' | 'schedules'>('create');

  const runs = useListExportJobs({ project_id: projectId, limit: 50 }, { refetchInterval: 4000 });
  const schedules = useListExportSchedules(projectId);
  const create = useCreateExportJob();
  const downloadMutation = useGetExportDownload();

  // Filter runs to this project when projectId is present on the run, or include general runs
  const projectRuns = (runs.data ?? []).filter((run: ExportJob) => !run.projectId || run.projectId === projectId);

  const downloadArtifact = async (run: ExportJob, artifact?: ExportArtifact) => {
    try {
      const result = await downloadMutation.mutateAsync({ jobId: run.id, artifactId: artifact?.id });
      if (result?.url) {
        window.location.assign(result.url);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.exports.workflow.downloadError'));
    }
  };

  const toggleFormat = (format: WorkflowFormat) =>
    setFormats((current: WorkflowFormat[]) =>
      current.includes(format) ? (current.length === 1 ? current : current.filter((item: WorkflowFormat) => item !== format)) : [...current, format],
    );

  return (
    <div className="space-y-7">
      <SectionHeader
        icon={<Archive className="size-4" />}
        title={t('settings.exports.title')}
        description={t('settings.exports.workflow.description')}
      />
      <nav aria-label={t('settings.exports.workflow.navLabel')} className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ['create', t('settings.exports.workflow.oneTime'), t('settings.exports.workflow.oneTimeDesc')],
            ['schedules', t('settings.exports.workflow.schedules'), t('settings.exports.workflow.schedulesDesc')],
          ] as const
        ).map(([value, title, description]) => (
          <Button
            aria-pressed={surface === value}
            className="h-auto flex-col items-start whitespace-normal p-3 text-start aria-pressed:border-primary aria-pressed:bg-primary/5"
            key={value}
            onClick={() => setSurface(value)}
            type="button"
            variant="outline"
          >
            <span className="block font-medium text-sm">{title}</span>
            <span className="mt-1 block text-muted-foreground text-xs">{description}</span>
          </Button>
        ))}
      </nav>

      {runs.isError || schedules.isError ? (
        <div aria-live="polite" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm">
          {t('settings.exports.workflow.loadError')}
        </div>
      ) : null}

      {surface === 'create' ? (
        <div className="space-y-6">
          {/* Create Export Section */}
          <section className="space-y-3">
            <div className="font-semibold text-sm">{t('settings.exports.workflow.create')}</div>
            <div className="rounded-xl border border-border p-4 bg-card">
              <div className="flex flex-wrap gap-3">
                {selectableFormats.map((format: WorkflowFormat) => (
                  <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm bg-background/50" key={format}>
                    <Switch checked={formats.includes(format)} id={`export-format-${format}`} onCheckedChange={() => toggleFormat(format)} />
                    <Label htmlFor={`export-format-${format}`} className="cursor-pointer">
                      {t(labelKeys[format] ?? 'settings.exports.workflow.format.markdown')}
                    </Label>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-muted-foreground text-xs">{t('settings.exports.workflow.formatHint')}</p>
                <Button
                  id="create-export-button"
                  disabled={create.isPending}
                  onClick={() => {
                    const toApiFmt = (f: WorkflowFormat): string => {
                      const lower = f.toLowerCase();
                      if (lower.includes('html')) return 'html';
                      if (lower.includes('pdf')) return 'pdf';
                      if (lower.includes('sqlite')) return 'sqlite';
                      return 'markdown';
                    };
                    const apiFormats = formats.map(toApiFmt);
                    create.mutate(
                      { projectId, formats: apiFormats, format: apiFormats[0] ?? 'markdown' },
                      {
                        onSuccess: () => toast.success(t('settings.exports.workflow.queued')),
                        onError: (error: Error) => toast.error(error.message),
                      },
                    );
                  }}
                >
                  {create.isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <FileArchive className="size-3.5" />}{' '}
                  {t('settings.exports.workflow.create')}
                </Button>
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              {t('settings.exports.workflow.legacyPrompt')}{' '}
              <a className="underline hover:text-foreground" download href={`/api/app/projects/${projectId}/export`}>
                {t('settings.exports.workflow.legacyDownload')}
              </a>
              {' · '}
              <a className="underline hover:text-foreground" download href={`/api/app/projects/${projectId}/theme-repository`}>
                {t('settings.theme.export')}
              </a>
              .
            </p>
          </section>

          {/* Export History Section under Create Export */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="font-semibold text-sm">{t('settings.exports.workflow.history')}</div>
                {projectRuns.length > 0 ? (
                  <Badge variant="secondary" className="text-xs font-normal">
                    {projectRuns.length}
                  </Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs">{t('settings.exports.workflow.historyDesc')}</p>
            </div>

            {projectRuns.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[180px]">Format</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                      <TableHead className="w-[160px]">Revision / Pages</TableHead>
                      <TableHead className="w-[180px]">Trigger & Date</TableHead>
                      <TableHead className="text-end">Artifacts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectRuns.map((run: ExportJob) => {
                      const runFormats = (run.formats as string[] | undefined) ?? (run.format ? [run.format as string] : ['MARKDOWN']);
                      const artifacts = (run.artifacts as ExportArtifact[] | undefined) ?? [];
                      const trigger = run.trigger ?? 'MANUAL';
                      const createdDate = run.createdAt || run.created_at;
                      const err = run.error || run.errorMessage || run.error_message;

                      return (
                        <TableRow key={run.id} className="align-middle">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Archive className="size-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs">
                                {runFormats.map((format: string) => t(labelKeys[format] ?? 'settings.exports.workflow.format.markdown')).join(', ')}
                              </span>
                            </div>
                            {err ? (
                              <div className="mt-1 text-[11px] text-destructive max-w-xs truncate" title={String(err)}>
                                {String(err)}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={run.status} />
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {(() => {
                              const snap = run.snapshot as Record<string, unknown> | undefined;
                              const version = (snap?.deploymentVersion ?? snap?.deployment_version) as number | string | undefined;
                              const m = run.metrics;
                              const pages = (m?.pagesCount ?? m?.pages_count ?? snap?.pagesCount ?? snap?.pages_count ?? 0) as number;
                              const totalMs = m?.totalMs ?? m?.total_ms;
                              const throughput = m?.throughputPagesPerSec ?? m?.throughput_pages_per_sec;
                              const words = m?.wordsCount ?? m?.words_count;
                              const fetchMs = m?.fetchMs ?? m?.fetch_ms;
                              const renderMs = m?.renderMs ?? m?.render_ms;
                              const storageMs = m?.storageMs ?? m?.storage_ms;

                              return (
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-foreground">
                                      {version ? `v${version}` : 'Draft'}
                                    </span>
                                    <span className="text-muted-foreground">· {pages.toLocaleString()} pages</span>
                                  </div>
                                  {m && totalMs !== undefined ? (
                                    <div
                                      className="mt-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
                                      title={`Fetch: ${fetchMs ?? 0}ms | Render: ${renderMs ?? 0}ms | Storage: ${storageMs ?? 0}ms`}
                                    >
                                      <span className="font-semibold">⚡ {totalMs}ms</span>
                                      {throughput ? (
                                        <>
                                          <span className="text-muted-foreground">·</span>
                                          <span>{throughput.toFixed(0)} p/s</span>
                                        </>
                                      ) : null}
                                      {words ? (
                                        <>
                                          <span className="text-muted-foreground">·</span>
                                          <span>{(words / 1000).toFixed(0)}k words</span>
                                        </>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            <div>
                              <span className="font-medium text-foreground">
                                {trigger === 'SCHEDULED'
                                  ? (run.schedule?.name ?? t('settings.exports.workflow.scheduled'))
                                  : t('settings.exports.workflow.manual')}
                              </span>
                              <div className="text-[11px] text-muted-foreground">{formatDate(createdDate, locale)}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-end">
                            {artifacts.length ? (
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                {artifacts.map((artifact: ExportArtifact) => (
                                  <Button
                                    key={artifact.id}
                                    onClick={() => downloadArtifact(run, artifact)}
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1 px-2 text-xs"
                                  >
                                    <Download className="size-3" />{' '}
                                    {artifact.format ? t(labelKeys[artifact.format] ?? 'settings.exports.workflow.format.markdown') : 'Download'}
                                    {artifact.size ? ` · ${sizeLabel(artifact.size)}` : ''}
                                  </Button>
                                ))}
                              </div>
                            ) : run.downloadUrl || run.download_url ? (
                              <div className="flex items-center justify-end">
                                <Button
                                  onClick={() => downloadArtifact(run)}
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 px-2 text-xs"
                                >
                                  <Download className="size-3" /> {t('settings.exports.workflow.legacyDownload')}
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : !runs.isLoading ? (
              <div className="rounded-xl border border-dashed p-6 text-center bg-card">
                <FileArchive className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-2 font-medium text-sm">{t('settings.exports.workflow.noRuns')}</p>
                <p className="mt-1 text-muted-foreground text-xs">{t('settings.exports.workflow.noRunsDesc')}</p>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {surface === 'schedules' ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">{t('settings.exports.workflow.archiveSchedules')}</div>
            <Button onClick={() => setShowSchedule((value) => !value)} size="sm" variant="outline">
              <Plus className="size-3.5" /> {t('settings.exports.workflow.newSchedule')}
            </Button>
          </div>
          {showSchedule ? <ScheduleForm projectId={projectId} onCreated={() => setShowSchedule(false)} /> : null}
          <div className="space-y-2">
            {schedules.data?.map((schedule: ExportSchedule) => (
              <ScheduleRow key={schedule.id} projectId={projectId} schedule={schedule} />
            ))}
            {!schedules.isLoading && !schedules.data?.length ? (
              <div className="rounded-xl border border-dashed p-6 text-center bg-card">
                <Archive className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-2 font-medium text-sm">{t('settings.exports.workflow.noSchedules')}</p>
                <p className="mt-1 text-muted-foreground text-xs">{t('settings.exports.workflow.noSchedulesDesc')}</p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLocale();
  const lower = status.toLowerCase();
  const normalizedKey =
    lower === 'completed' || lower === 'succeeded'
      ? 'succeeded'
      : lower === 'processing' || lower === 'running'
        ? 'running'
        : lower === 'failed'
          ? 'failed'
          : lower === 'cancelled'
            ? 'cancelled'
            : 'pending';

  const variant = normalizedKey === 'failed' ? 'destructive' : normalizedKey === 'succeeded' ? 'default' : 'secondary';

  return (
    <Badge variant={variant}>
      {t(`settings.exports.workflow.status.${normalizedKey}` as MessageKey)}
    </Badge>
  );
}

function ScheduleForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const { t } = useLocale();
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [name, setName] = useState(() => t('settings.exports.workflow.defaultScheduleName'));
  const [cadence, setCadence] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');
  const [time, setTime] = useState('02:00');
  const [weekday, setWeekday] = useState('1');
  const [monthday, setMonthday] = useState(1);
  const [retentionCount, setRetentionCount] = useState(12);
  const [retentionDays, setRetentionDays] = useState(90);
  const [scheduleFormats, setScheduleFormats] = useState<WorkflowFormat[]>(['MARKDOWN', 'PDF', 'STATIC_HTML', 'SQLITE']);

  const toggleScheduleFormat = (format: WorkflowFormat) =>
    setScheduleFormats((current: WorkflowFormat[]) =>
      current.includes(format) ? (current.length === 1 ? current : current.filter((item: WorkflowFormat) => item !== format)) : [...current, format],
    );

  const create = useCreateExportSchedule(projectId);

  const cadenceOptions = [
    { value: 'DAILY', label: t('settings.exports.workflow.daily') },
    { value: 'WEEKLY', label: t('settings.exports.workflow.weekly') },
    { value: 'MONTHLY', label: t('settings.exports.workflow.monthly') },
  ];

  const weekdayOptions = [
    { value: '0', label: t('settings.exports.workflow.day.sunday') },
    { value: '1', label: t('settings.exports.workflow.day.monday') },
    { value: '2', label: t('settings.exports.workflow.day.tuesday') },
    { value: '3', label: t('settings.exports.workflow.day.wednesday') },
    { value: '4', label: t('settings.exports.workflow.day.thursday') },
    { value: '5', label: t('settings.exports.workflow.day.friday') },
    { value: '6', label: t('settings.exports.workflow.day.saturday') },
  ];

  const createSchedule = () => {
    const [hourStr, minuteStr] = time.split(':');
    const hour = Number(hourStr) || 2;
    const minute = Number(minuteStr) || 0;

    create.mutate(
      {
        name,
        formats: scheduleFormats,
        format: scheduleFormats[0],
        cadence,
        frequency: cadence.toLowerCase(),
        timezone,
        hour,
        minute,
        time_of_day: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
        ...(cadence === 'WEEKLY' ? { weekday: Number(weekday), day_of_week: Number(weekday) } : {}),
        ...(cadence === 'MONTHLY' ? { monthday, day_of_month: monthday } : {}),
        retentionCount,
        retention_count: retentionCount,
        retentionDays,
        retention_days: retentionDays,
        is_active: true,
      },
      {
        onSuccess: () => {
          toast.success(t('settings.exports.workflow.scheduleCreated'));
          onCreated();
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  return (
    <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
      <Input aria-label={t('settings.exports.workflow.scheduleName')} onChange={(event) => setName(event.target.value)} value={name} />
      <Input aria-label={t('settings.exports.workflow.timezone')} dir="ltr" onChange={(event) => setTimezone(event.target.value)} value={timezone} />
      <Select items={cadenceOptions} onValueChange={(next) => setCadence((next ?? 'DAILY') as 'DAILY' | 'WEEKLY' | 'MONTHLY')} value={cadence}>
        <SelectTrigger aria-label={t('settings.exports.workflow.schedules')} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {cadenceOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input aria-label={t('settings.exports.workflow.localTime')} onChange={(event) => setTime(event.target.value)} type="time" value={time} />
      {cadence === 'WEEKLY' ? (
        <Select items={weekdayOptions} onValueChange={(next) => setWeekday(next ?? '1')} value={weekday}>
          <SelectTrigger aria-label={t('settings.exports.workflow.weekday')} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {weekdayOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {cadence === 'MONTHLY' ? (
        <Input
          aria-label={t('settings.exports.workflow.monthDay')}
          max={31}
          min={1}
          onChange={(event) => setMonthday(Number(event.target.value))}
          type="number"
          value={monthday}
        />
      ) : null}
      <Input
        aria-label={t('settings.exports.workflow.retainRuns')}
        max={100}
        min={1}
        onChange={(event) => setRetentionCount(Number(event.target.value))}
        type="number"
        value={retentionCount}
      />
      <Input
        aria-label={t('settings.exports.workflow.retentionDays')}
        max={3650}
        min={1}
        onChange={(event) => setRetentionDays(Number(event.target.value))}
        type="number"
        value={retentionDays}
      />
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        {selectableFormats.map((format: WorkflowFormat) => (
          <div className="flex items-center gap-1.5 text-xs" key={format}>
            <Switch
              checked={scheduleFormats.includes(format)}
              id={`schedule-format-${format}`}
              onCheckedChange={() => toggleScheduleFormat(format)}
              size="sm"
            />
            <Label className="text-xs" htmlFor={`schedule-format-${format}`}>
              {t(labelKeys[format] ?? 'settings.exports.workflow.format.markdown')}
            </Label>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end sm:col-span-2">
        <Button disabled={!name.trim() || !timezone.trim() || create.isPending} onClick={createSchedule} size="sm">
          {t('settings.exports.workflow.createSchedule')}
        </Button>
      </div>
    </div>
  );
}

function ScheduleRow({ projectId, schedule }: { projectId: string; schedule: ExportSchedule }) {
  const { locale, t } = useLocale();
  const update = useUpdateExportSchedule(projectId);
  const del = useDeleteExportSchedule(projectId);
  const run = useRunExportSchedule(projectId);

  const isEnabled = schedule.enabled ?? schedule.is_active ?? schedule.isActive ?? true;
  const cadence = (schedule.cadence ?? schedule.frequency ?? 'DAILY').toUpperCase();
  const hour = schedule.hour ?? (schedule.time_of_day ? Number(schedule.time_of_day.split(':')[0]) : 0);
  const minute = schedule.minute ?? (schedule.time_of_day ? Number(schedule.time_of_day.split(':')[1]) : 0);
  const tz = schedule.timezone ?? 'UTC';
  const nextRun = schedule.nextRunAt ?? schedule.next_run_at;
  const jobCount = schedule._count?.jobs ?? 0;
  const lastErr = schedule.lastError ?? schedule.last_error;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div>
        <div className="flex items-center gap-2 font-medium text-sm">
          <span dir="auto">{schedule.name || 'Export Schedule'}</span>
          <Badge variant="secondary">{isEnabled ? t('settings.exports.workflow.enabled') : t('settings.exports.workflow.disabled')}</Badge>
        </div>
        <div className="mt-1 text-muted-foreground text-xs">
          {t(`settings.exports.workflow.${cadence.toLowerCase()}` as MessageKey)} {t('settings.exports.workflow.at')}{' '}
          <span dir="ltr">
            {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')} {tz}
          </span>{' '}
          · {t('settings.exports.workflow.next')} {formatDate(nextRun, locale)} ·{' '}
          {t('settings.exports.workflow.runCount', { count: jobCount })}
        </div>
        {lastErr ? (
          <div className="mt-1 text-destructive text-xs" dir="auto">
            {lastErr}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button
          disabled={run.isPending}
          onClick={() =>
            run.mutate(schedule.id, {
              onSuccess: () => toast.success(t('settings.exports.workflow.runQueued')),
              onError: (error: Error) => toast.error(error.message),
            })
          }
          size="sm"
          variant="outline"
        >
          <Play className="size-3.5" /> {t('settings.exports.workflow.runNow')}
        </Button>
        <Button
          disabled={update.isPending}
          onClick={() =>
            update.mutate(
              {
                scheduleId: schedule.id,
                payload: {
                  enabled: !isEnabled,
                  is_active: !isEnabled,
                  isActive: !isEnabled,
                },
              },
              { onError: (error: Error) => toast.error(error.message) },
            )
          }
          size="sm"
          variant="outline"
        >
          {isEnabled ? t('settings.exports.workflow.disable') : t('settings.exports.workflow.enable')}
        </Button>
        <Button
          disabled={del.isPending}
          onClick={() =>
            del.mutate(schedule.id, {
              onError: (error: Error) => toast.error(error.message),
            })
          }
          size="sm"
          variant="outline"
        >
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
