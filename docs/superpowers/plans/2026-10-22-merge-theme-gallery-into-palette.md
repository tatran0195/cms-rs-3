# Merge Theme Presets into Palette Editor & Purge Theme Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move theme preset selection (`harbor`, `manuscript`, `signal`) into the `palette` drill-down editor in `ThemePropsTable`, add JSON Theme Export and Import actions to the `ThemePropsTable` header bar with a modal dialog, and completely remove the standalone `ThemePresetsAndExchange` card from the bottom of `ThemeSection`.

**Architecture:** Extend `ThemePaletteEditor` to include a segmented preset selector in its header alongside the light/dark mode switch. Create a standalone `ThemeImportDialog` for JSON theme uploads and preview diffing. Update `ThemePropsTable` to house Export/Import actions in its header and wire `ThemePaletteEditor` and `ThemeImportDialog`. Clean up `ThemeSection` by removing `<ThemePresetsAndExchange>` and forwarding callbacks through `ThemePlaygroundStory`.

**Tech Stack:** React 19, TypeScript, Vitest with jsdom, Tailwind CSS, Lucide icons, `@cms/shared/themes`, `@cms/sdk/react`, `@cms/design-system`.

## Global Constraints

- No Plan, Billing, or Pricing features allowed anywhere.
- No public marketing routes or landing pages.
- Must preserve active `docsLayout` when switching presets (presets only own colors and components).
- Max JSON template size is `MAX_THEME_TEMPLATE_BYTES` (128 KB).
- All tests must pass via `bun test`.
- Strict typecheck must pass via `bun run typecheck`.

---

### Task 1: Add Preset Switcher to `ThemePaletteEditor`

**Files:**
- Modify: `apps/studio/src/features/project-settings/components/theme/theme-palette-editor.tsx`
- Test: `apps/studio/src/features/project-settings/components/theme/theme-palette-editor.test.tsx`

**Interfaces:**
- Consumes:
  - `THEME_PRESET_IDS`, `THEME_PRESETS`, `ThemePresetId` from `@cms/shared/themes`
- Produces:
  - `ThemePaletteEditorProps` extended with `activePreset?: ThemePresetId` and `onSelectPreset?: (preset: ThemePresetId) => void`
  - Preset buttons rendered with `data-preset-id={presetId}` and swatch dot indicators

- [ ] **Step 1: Write the failing test**

Add unit tests to `apps/studio/src/features/project-settings/components/theme/theme-palette-editor.test.tsx` checking that preset buttons are rendered and clicking one triggers `onSelectPreset`.

```typescript
  it('renders preset buttons and triggers onSelectPreset when clicked', async () => {
    const handleSelectPreset = vi.fn();
    await act(async () => {
      root.render(
        <ThemePaletteEditor
          colors={harbor.colors}
          activePreset="harbor"
          onSelectPreset={handleSelectPreset}
          mode="light"
          onColorChange={vi.fn()}
        />,
      );
    });

    const signalBtn = container.querySelector('button[data-preset-id="signal"]');
    expect(signalBtn).toBeDefined();
    expect(container.textContent).toContain('Harbor');
    expect(container.textContent).toContain('Manuscript');
    expect(container.textContent).toContain('Signal');

    await act(async () => {
      (signalBtn as HTMLElement)?.click();
    });

    expect(handleSelectPreset).toHaveBeenCalledWith('signal');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/studio/src/features/project-settings/components/theme/theme-palette-editor.test.tsx`
Expected: FAIL (cannot find `button[data-preset-id="signal"]` or `onSelectPreset` not handled)

- [ ] **Step 3: Update `ThemePaletteEditor` implementation**

Modify `apps/studio/src/features/project-settings/components/theme/theme-palette-editor.tsx`:
1. Import `THEME_PRESET_IDS`, `THEME_PRESETS`, and `type ThemePresetId` from `@cms/shared/themes`.
2. Add `activePreset?: ThemePresetId` and `onSelectPreset?: (preset: ThemePresetId) => void` to `ThemePaletteEditorProps`.
3. In the top header bar, beside the Light/Dark mode switch, add a preset selector with segmented buttons for `'harbor'`, `'manuscript'`, `'signal'`.
4. Each button displays the formatted preset name (`Harbor`, `Manuscript`, `Signal`) and mini color preview dots (e.g. `colors.canvas`, `colors.accent`, `colors.code`).
5. Wire `onClick={() => onSelectPreset?.(id)}` and `data-preset-id={id}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/studio/src/features/project-settings/components/theme/theme-palette-editor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/project-settings/components/theme/theme-palette-editor.tsx apps/studio/src/features/project-settings/components/theme/theme-palette-editor.test.tsx
git commit -m "feat(studio): add preset selector to ThemePaletteEditor"
```

---

### Task 2: Create `ThemeImportDialog` Component

**Files:**
- Create: `apps/studio/src/features/project-settings/components/theme/theme-import-dialog.tsx`
- Test: `apps/studio/src/features/project-settings/components/theme/theme-import-dialog.test.tsx`

**Interfaces:**
- Consumes:
  - `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `@cms/design-system/components/ui/dialog`
  - `Button` from `@cms/design-system/components/ui/button`
  - `Textarea` from `@cms/design-system/components/ui/textarea`
  - `useImportProjectTheme` from `@cms/sdk/react`
  - `MAX_THEME_TEMPLATE_BYTES`, `cmsThemeConfig` from `@cms/shared/themes`
- Produces:
  - `export function ThemeImportDialog(props: ThemeImportDialogProps): ReactElement`

- [ ] **Step 1: Write the failing test**

Create `apps/studio/src/features/project-settings/components/theme/theme-import-dialog.test.tsx`:
Test that `ThemeImportDialog` opens, accepts JSON input, displays diff information, and invokes `onApplyTheme` upon clicking "Apply".

```typescript
// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeImportDialog } from './theme-import-dialog';

// @ts-expect-error configure react act environment for jsdom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mutation = {
  isPending: false,
  mutate: vi.fn(),
};

vi.mock('@cms/i18n/react', () => ({
  useT: () => (key: string) => key,
  translateFn: (key: string) => key,
}));

vi.mock('@cms/sdk/react', () => ({
  useImportProjectTheme: () => mutation,
}));

describe('ThemeImportDialog', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders dialog when open', async () => {
    await act(async () => {
      root.render(
        <ThemeImportDialog
          projectId="test-proj"
          open={true}
          onOpenChange={vi.fn()}
          onApplyTheme={vi.fn()}
        />,
      );
    });

    expect(document.body.textContent).toContain('settings.theme.importTitle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/studio/src/features/project-settings/components/theme/theme-import-dialog.test.tsx`
Expected: FAIL (Cannot find module `./theme-import-dialog`)

- [ ] **Step 3: Implement `ThemeImportDialog`**

Create `apps/studio/src/features/project-settings/components/theme/theme-import-dialog.tsx`:
```typescript
import { Button } from '@cms/design-system/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@cms/design-system/components/ui/dialog';
import { Textarea } from '@cms/design-system/components/ui/textarea';
import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import type { ProjectThemeImportResult } from '@cms/sdk';
import { useImportProjectTheme } from '@cms/sdk/react';
import { type cmsThemeConfig, MAX_THEME_TEMPLATE_BYTES } from '@cms/shared/themes';
import { AlertCircle, CheckCircle2, FileJson, Upload } from 'lucide-react';
import { type ChangeEvent, useRef, useState } from 'react';
import { toast } from 'sonner';

export interface ThemeImportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyTheme: (theme: cmsThemeConfig, appearance?: 'light' | 'dark' | 'system') => void;
}

export function ThemeImportDialog({ projectId, open, onOpenChange, onApplyTheme }: ThemeImportDialogProps) {
  const t = useT();
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importText, setImportText] = useState('');
  const [importTemplate, setImportTemplate] = useState<unknown>();
  const [importPreview, setImportPreview] = useState<ProjectThemeImportResult>();
  const fileInput = useRef<HTMLInputElement>(null);

  const importProjectTheme = useImportProjectTheme(projectId);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportText('');
    setImportTemplate(undefined);
    setImportPreview(undefined);
    if (file.size > MAX_THEME_TEMPLATE_BYTES) {
      toast.error(t('settings.theme.import.tooLarge'));
      return;
    }
    const text = await file.text();
    setImportText(text);
    try {
      const parsed = JSON.parse(text) as unknown;
      setImportTemplate(parsed);
      triggerPreview(parsed, importMode);
    } catch {
      toast.error(t('settings.theme.import.invalidJson'));
    }
  };

  const triggerPreview = (template: unknown, mode: 'merge' | 'replace') => {
    importProjectTheme.mutate(
      { template, mode, apply: false },
      {
        onSuccess: (result) => setImportPreview(result),
        onError: (err) => {
          setImportPreview(undefined);
          toast.error(err instanceof Error ? err.message : t('settings.theme.import.failed'));
        },
      },
    );
  };

  const handleTextChange = (text: string) => {
    setImportText(text);
    setImportPreview(undefined);
    if (!text.trim()) {
      setImportTemplate(undefined);
      return;
    }
    if (new TextEncoder().encode(text).byteLength > MAX_THEME_TEMPLATE_BYTES) {
      toast.error(t('settings.theme.import.tooLarge'));
      return;
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      setImportTemplate(parsed);
      triggerPreview(parsed, importMode);
    } catch {
      // Allow user to finish typing JSON without erroring immediately
    }
  };

  const handleApply = () => {
    if (!importTemplate) return;
    importProjectTheme.mutate(
      { template: importTemplate, mode: importMode, apply: true },
      {
        onSuccess: (result) => {
          if (result.theme) {
            onApplyTheme(result.theme, result.appearance);
            toast.success(t('settings.theme.import.applied'));
            onOpenChange(false);
            setImportText('');
            setImportTemplate(undefined);
            setImportPreview(undefined);
          }
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : t('settings.theme.import.failed'));
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="size-5 text-primary" />
            <span>{t('settings.theme.importTitle')}</span>
          </DialogTitle>
          <DialogDescription>{t('settings.theme.importHint')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File Picker & Mode Selection */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" onChange={handleFile} />
              <Button size="sm" variant="outline" className="cursor-pointer gap-1.5" onClick={() => fileInput.current?.click()} type="button">
                <Upload className="size-3.5" />
                <span>{t('settings.theme.chooseFile')}</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('settings.theme.importMode')}:</span>
              <div className="flex rounded-md border border-border bg-background p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('merge');
                    if (importTemplate) triggerPreview(importTemplate, 'merge');
                  }}
                  className={cn(
                    'rounded px-2.5 py-1 font-mono transition-colors cursor-pointer',
                    importMode === 'merge' ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('settings.theme.importMerge')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('replace');
                    if (importTemplate) triggerPreview(importTemplate, 'replace');
                  }}
                  className={cn(
                    'rounded px-2.5 py-1 font-mono transition-colors cursor-pointer',
                    importMode === 'replace' ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('settings.theme.importReplace')}
                </button>
              </div>
            </div>
          </div>

          {/* JSON Textarea */}
          <Textarea
            value={importText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={t('settings.theme.importPlaceholder')}
            className="font-mono text-xs min-h-[140px]"
          />

          {/* Preview / Diff Box */}
          {importPreview && (
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span>Valid Theme Template: {importPreview.metadata?.name || 'Untitled Theme'}</span>
              </div>
              <p className="text-muted-foreground">{importPreview.summary}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleApply}
            disabled={!importTemplate || importProjectTheme.isPending}
            type="button"
            className="cursor-pointer"
          >
            {importProjectTheme.isPending ? t('common.saving') : t('settings.theme.applyTheme')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/studio/src/features/project-settings/components/theme/theme-import-dialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/project-settings/components/theme/theme-import-dialog.tsx apps/studio/src/features/project-settings/components/theme/theme-import-dialog.test.tsx
git commit -m "feat(studio): add ThemeImportDialog component"
```

---

### Task 3: Add Export & Import Actions to `ThemePropsTable` Header & Wire `ThemePaletteEditor`

**Files:**
- Modify: `apps/studio/src/features/project-settings/components/theme/theme-props-table.tsx`
- Modify: `apps/studio/src/features/project-settings/components/theme/theme-props-table.test.tsx`

**Interfaces:**
- Consumes:
  - `ThemeImportDialog` from `./theme-import-dialog`
  - `Download`, `Upload` from `lucide-react`
  - `activePreset`, `onSelectPreset`, `onExport`, `onImportTheme`, `projectId`, `isExporting` props
- Produces:
  - Export and Import action buttons in header toolbar of `ThemePropsTable`
  - Passes `activePreset` and `onSelectPreset` to `<ThemePaletteEditor>`

- [ ] **Step 1: Write the failing test**

In `apps/studio/src/features/project-settings/components/theme/theme-props-table.test.tsx`, add tests:
1. Verifying Export and Import buttons are rendered in the header.
2. Clicking Export triggers `onExport`.
3. Clicking Import opens the import dialog.
4. When inside `palette` drill-down, `<ThemePaletteEditor>` receives `activePreset` and `onSelectPreset`.

```typescript
  it('renders Export and Import buttons in header and handles clicks', async () => {
    const handleExport = vi.fn();
    await act(async () => {
      root.render(
        <ThemePropsTable
          path={[]}
          onNavigate={vi.fn()}
          themeConfig={{}}
          onThemeConfigChange={vi.fn()}
          resolvedColors={harbor.colors}
          resolvedLayout={harbor.layout}
          resolvedComponents={harbor.components}
          onReset={vi.fn()}
          onExport={handleExport}
          projectId="test-proj"
        />,
      );
    });

    const exportBtn = container.querySelector('button[aria-label="Export Theme JSON"]');
    const importBtn = container.querySelector('button[aria-label="Import Theme JSON"]');
    expect(exportBtn).toBeDefined();
    expect(importBtn).toBeDefined();

    await act(async () => {
      (exportBtn as HTMLElement)?.click();
    });

    expect(handleExport).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/studio/src/features/project-settings/components/theme/theme-props-table.test.tsx`
Expected: FAIL (missing export/import buttons in header)

- [ ] **Step 3: Modify `ThemePropsTable`**

In `apps/studio/src/features/project-settings/components/theme/theme-props-table.tsx`:
1. Import `Download`, `Upload` from `lucide-react`.
2. Import `ThemeImportDialog` from `./theme-import-dialog`.
3. Add props to `ThemePropsTableProps`:
   ```typescript
   activePreset?: ThemePresetId;
   onSelectPreset?: (preset: ThemePresetId) => void;
   onExport?: () => void;
   onImportTheme?: (theme: cmsThemeConfig, appearance?: 'light' | 'dark' | 'system') => void;
   projectId?: string;
   isExporting?: boolean;
   ```
4. Add state: `const [importDialogOpen, setImportDialogOpen] = useState(false);`
5. In the header bar (`<nav className="flex h-10 ...">`):
   Beside the Reset button (`RotateCcw`), add:
   - Export button:
     ```tsx
     {onExport && (
       <button
         type="button"
         onClick={onExport}
         disabled={isExporting}
         className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
         title="Export Theme JSON"
         aria-label="Export Theme JSON"
       >
         <Download className="size-3.5" />
       </button>
     )}
     ```
   - Import button:
     ```tsx
     {projectId && onImportTheme && (
       <button
         type="button"
         onClick={() => setImportDialogOpen(true)}
         className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
         title="Import Theme JSON"
         aria-label="Import Theme JSON"
       >
         <Upload className="size-3.5" />
       </button>
     )}
     ```
6. In `currentCategory === 'palette'`:
   Pass `activePreset={activePreset}` and `onSelectPreset={onSelectPreset}` to `<ThemePaletteEditor>`.
7. Render `<ThemeImportDialog>` at the bottom of `ThemePropsTable` when `projectId` and `onImportTheme` are provided.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/studio/src/features/project-settings/components/theme/theme-props-table.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/project-settings/components/theme/theme-props-table.tsx apps/studio/src/features/project-settings/components/theme/theme-props-table.test.tsx
git commit -m "feat(studio): add export, import, and preset wiring to ThemePropsTable"
```

---

### Task 4: Connect `ThemePlaygroundStory`, `ThemeSection`, and Purge `ThemePresetsAndExchange`

**Files:**
- Modify: `apps/studio/src/features/project-settings/components/theme/theme-playground-story.tsx`
- Modify: `apps/studio/src/features/project-settings/components/theme-section.tsx`
- Modify: `apps/studio/src/features/project-settings/components/theme/index.ts`
- Delete: `apps/studio/src/features/project-settings/components/theme/theme-presets-and-exchange.tsx`
- Delete: `apps/studio/src/features/project-settings/components/theme/theme-presets-and-exchange.test.tsx`
- Modify: `apps/studio/src/features/project-settings/components/theme-section.test.tsx`

**Interfaces:**
- Consumes:
  - `useExportProjectTheme` in `ThemeSection`
  - `ThemePlaygroundStory` forwarding preset and exchange callbacks to `ThemePropsTable`
- Produces:
  - Clean `ThemeSection` without bottom `<ThemePresetsAndExchange>` card

- [ ] **Step 1: Write the failing test**

In `apps/studio/src/features/project-settings/components/theme-section.test.tsx`:
1. Verify that `ThemePresetsAndExchange` gallery cards are no longer present on the page (`settings.theme.gallery` not in container text).
2. Update the preset switching test so it navigates into `palette` prop first:
   ```typescript
   it('switches baseline preset and updates preview', async () => {
     const paletteRow = container.querySelector<HTMLButtonElement>('button[data-prop-id="palette"]');
     if (!paletteRow) throw new Error('missing palette prop button');

     await act(async () => paletteRow.click());

     const signalBtn = container.querySelector<HTMLButtonElement>('button[data-preset-id="signal"]');
     if (!signalBtn) throw new Error('missing signal preset button');

     await act(async () => signalBtn.click());

     expect(preview()?.dataset.preset).toBe('signal');
     expect(preview()?.dataset.cards).toBe(THEME_PRESETS.signal.components.cards);
   });
   ```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/studio/src/features/project-settings/components/theme-section.test.tsx`
Expected: FAIL (preset button not found or gallery still present)

- [ ] **Step 3: Modify `ThemePlaygroundStory`, `ThemeSection`, and delete `ThemePresetsAndExchange`**

1. In `apps/studio/src/features/project-settings/components/theme/theme-playground-story.tsx`:
   - Extend `ThemePlaygroundStoryProps` with:
     ```typescript
     projectId?: string;
     activePreset?: ThemePresetId;
     onSelectPreset?: (presetId: ThemePresetId) => void;
     onExport?: () => void;
     onImportTheme?: (theme: cmsThemeConfig, appearance?: 'light' | 'dark' | 'system') => void;
     isExporting?: boolean;
     ```
   - Forward these props to `<ThemePropsTable>`.
2. In `apps/studio/src/features/project-settings/components/theme-section.tsx`:
   - Import `useExportProjectTheme` from `@cms/sdk/react` and `toast` from `sonner`.
   - Setup `exportProjectTheme = useExportProjectTheme(project.id);`.
   - Implement `handleExport`:
     ```typescript
     const handleExport = () => {
       exportProjectTheme.mutate(undefined, {
         onSuccess: ({ json }) => {
           const href = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
           const anchor = document.createElement('a');
           anchor.href = href;
           anchor.download = `${project.slug || 'cms'}-theme.json`;
           anchor.click();
           URL.revokeObjectURL(href);
           toast.success(t('settings.theme.exported'));
         },
         onError: () => toast.error(t('settings.theme.exportError')),
       });
     };
     ```
   - Pass `projectId={project.id}`, `activePreset={resolved.id}`, `onSelectPreset`, `onExport={handleExport}`, `isExporting={exportProjectTheme.isPending}`, and `onImportTheme` to `<ThemePlaygroundStory>`.
   - Remove `<ThemePresetsAndExchange>` JSX block and import entirely.
3. Remove `theme-presets-and-exchange.tsx` and `theme-presets-and-exchange.test.tsx`.
4. Update `apps/studio/src/features/project-settings/components/theme/index.ts` to export `ThemeImportDialog` and remove `ThemePresetsAndExchange`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/studio/src/features/project-settings/components/theme-section.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/project-settings/components/theme/ apps/studio/src/features/project-settings/components/theme-section.tsx apps/studio/src/features/project-settings/components/theme-section.test.tsx
git rm apps/studio/src/features/project-settings/components/theme/theme-presets-and-exchange.tsx apps/studio/src/features/project-settings/components/theme/theme-presets-and-exchange.test.tsx
git commit -m "refactor(studio): purge ThemePresetsAndExchange and connect preset/exchange to Props Table"
```

---

### Task 5: Full Verification and Typecheck

**Files:**
- All affected files

- [ ] **Step 1: Run all theme test suites**

Run: `bun test apps/studio/src/features/project-settings/components/theme apps/studio/src/features/project-settings/components/theme-section.test.tsx`
Expected: ALL PASS

- [ ] **Step 2: Run all studio tests**

Run: `bun run --filter=@cms/studio test`
Expected: ALL PASS

- [ ] **Step 3: Run strict monorepo typecheck**

Run: `bun run typecheck`
Expected: 0 errors across all workspaces

- [ ] **Step 4: Commit any remaining updates if needed**

```bash
git status
```
Ensure working tree is clean.
