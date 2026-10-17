// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cms/i18n/react', () => ({
  useLocale: () => ({
    locale: 'en',
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
  useT: () => (key: string) => key,
}));

vi.mock('./openapi-section', () => ({
  OpenApiSection: () => null,
}));

vi.mock('@/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared')>();
  return {
    ...actual,
    localeTag: (l: string) => l,
    useFormatters: () => ({
      number: (n: number | bigint) => String(n),
      currency: (n: number) => `$${n}`,
      date: (d: string | number | Date) => String(d),
      dateTime: (d: string | number | Date) => String(d),
      relativeTime: (d: string | number | Date) => String(d),
      shortDate: (d: string | number | Date) => String(d),
      percent: (n: number) => `${n}%`,
    }),
  };
});

let mockExportJobs: any[] = [];
let mockExportSchedules: any[] = [];
const mockRunScheduleMutate = vi.fn();

vi.mock('@cms/sdk/react', () => ({
  useListExportJobs: () => ({ data: mockExportJobs, isLoading: false, isError: false }),
  useListExportSchedules: () => ({ data: mockExportSchedules, isLoading: false, isError: false }),
  useCreateExportJob: () => ({ isPending: false, mutate: vi.fn() }),
  useCreateExportSchedule: () => ({ isPending: false, mutate: vi.fn() }),
  useUpdateExportSchedule: () => ({ isPending: false, mutate: vi.fn() }),
  useDeleteExportSchedule: () => ({ isPending: false, mutate: vi.fn() }),
  useRunExportSchedule: () => ({ isPending: false, mutate: mockRunScheduleMutate }),
  useGetExportDownload: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

import { isSectionId, SECTIONS } from '../ProjectSettingsPage';
import { ExportsSection } from './exports-section';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

describe('ExportsSection and Section Registration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockExportJobs = [];
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('registers exports in SECTIONS under advanced group', () => {
    expect(isSectionId('exports')).toBe(true);
    const exportsDef = SECTIONS.find((s) => s.id === 'exports');
    expect(exportsDef).toBeDefined();
    expect(exportsDef?.group).toBe('advanced');
  });

  it('renders one-time and schedules navigation buttons (no Run history button), and displays history section under create export with SQLite toggle', async () => {
    await act(async () => root.render(<ExportsSection projectId="proj-123" />));

    const buttons = [...container.querySelectorAll<HTMLButtonElement>('nav[aria-label] button')];
    // Exactly 2 top navigation buttons: One-time export and Schedules (Run history button removed)
    expect(buttons.length).toBe(2);
    expect(container.textContent).toContain('settings.exports.title');
    expect(container.textContent).toContain('settings.exports.workflow.oneTime');
    expect(container.textContent).toContain('settings.exports.workflow.schedules');

    // History is rendered directly under Create Export on the default view
    expect(container.textContent).toContain('settings.exports.workflow.create');
    expect(container.textContent).toContain('settings.exports.workflow.history');

    // Verify format options include SQLite
    expect(container.textContent).toContain('settings.exports.workflow.format.sqlite');
    expect(container.textContent).toContain('settings.exports.workflow.format.markdown');
    expect(container.textContent).toContain('settings.exports.workflow.format.pdf');
    expect(container.textContent).toContain('settings.exports.workflow.format.html');
  });

  it('renders enterprise snapshot revision, page count, trigger, and artifact download buttons when runs exist', async () => {
    mockExportJobs = [
      {
        id: 'job-1',
        projectId: 'proj-123',
        status: 'COMPLETED',
        formats: ['MARKDOWN', 'SQLITE'],
        trigger: 'MANUAL',
        createdAt: '2026-10-16T12:00:00Z',
        snapshot: {
          deploymentVersion: 3,
          pagesCount: 42,
          createdAt: '2026-10-16T11:59:00Z',
        },
        artifacts: [
          {
            id: 'art-1',
            format: 'MARKDOWN',
            size: 2097152,
            fileName: 'docs-markdown.zip',
          },
          {
            id: 'art-2',
            format: 'SQLITE',
            size: 524288,
            fileName: 'database.sqlite',
          },
        ],
      },
    ];

    await act(async () => root.render(<ExportsSection projectId="proj-123" />));

    // Revision and page count rendered
    expect(container.textContent).toContain('v3');
    expect(container.textContent).toContain('42 pages');

    // Manual trigger rendered
    expect(container.textContent).toContain('settings.exports.workflow.manual');

    // Download buttons for both artifacts rendered
    expect(container.textContent).toContain('settings.exports.workflow.format.markdown');
    expect(container.textContent).toContain('settings.exports.workflow.format.sqlite');
  });

  it('renders schedule row and triggers run on demand when Run Now is clicked', async () => {
    mockExportSchedules = [
      {
        id: 'sched-456',
        name: 'Nightly Backup',
        enabled: true,
        cadence: 'DAILY',
        hour: 2,
        minute: 0,
        timezone: 'UTC',
        format: 'SQLITE',
        _count: { jobs: 5 },
      },
    ];

    await act(async () => root.render(<ExportsSection projectId="proj-123" />));

    // Switch to schedules tab
    const schedulesNavBtn = container.querySelectorAll<HTMLButtonElement>('nav[aria-label] button')[1];
    await act(async () => {
      schedulesNavBtn?.click();
    });

    expect(container.textContent).toContain('Nightly Backup');
    expect(container.textContent).toContain('settings.exports.workflow.runNow');

    // Find and click the Run Now button
    const runNowBtn = [...container.querySelectorAll<HTMLButtonElement>('button')].find((btn) =>
      btn.textContent?.includes('settings.exports.workflow.runNow'),
    );
    expect(runNowBtn).toBeDefined();

    await act(async () => {
      runNowBtn?.click();
    });

    expect(mockRunScheduleMutate).toHaveBeenCalledWith('sched-456', expect.any(Object));
  });
});

