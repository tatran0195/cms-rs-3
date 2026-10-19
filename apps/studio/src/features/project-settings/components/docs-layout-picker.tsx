import { cn } from '@cms/design-system/lib/utils';
import { useT } from '@cms/i18n/react';
import { DOCS_LAYOUT_IDS, type DocsLayoutId, resolveDocsLayout } from '@cms/shared/themes';

export interface DocsLayoutPickerProps {
  value?: DocsLayoutId;
  onChange: (layout: DocsLayoutId) => void;
  className?: string;
}

function DocsLayoutThumbnail({ layoutId }: { layoutId: DocsLayoutId }) {
  if (layoutId === 'notebook') {
    return (
      <span className="mb-3 flex h-20 flex-col overflow-hidden rounded-lg border border-border bg-muted/40 p-1 gap-1" aria-hidden>
        <span className="flex flex-col border-b border-border/60 pb-0.5">
          <span className="flex items-center justify-between pb-0.5">
            <span className="size-1.5 rounded-full bg-primary" />
            <span className="h-1 w-6 rounded bg-muted-foreground/30" />
          </span>
          <span className="flex gap-1">
            <span className="h-0.5 w-4 rounded bg-primary" />
            <span className="h-0.5 w-3 rounded bg-muted-foreground/30" />
          </span>
        </span>
        <span className="grid grid-cols-[22%_1fr] gap-1 flex-1 items-center">
          <span className="flex flex-col gap-1 pr-1">
            <span className="h-1 w-full rounded bg-muted-foreground/30" />
            <span className="h-1 w-2/3 rounded bg-muted-foreground/20" />
          </span>
          <span className="flex flex-col gap-1 p-1 bg-card rounded-md border border-border/60 shadow-xs">
            <span className="h-1.5 w-1/2 rounded bg-foreground/80" />
            <span className="h-1 w-full rounded bg-muted-foreground/20" />
            <span className="h-1 w-3/4 rounded bg-muted-foreground/20" />
          </span>
        </span>
      </span>
    );
  }

  if (layoutId === 'glass') {
    return (
      <span
        className="mb-3 flex h-20 flex-col overflow-hidden rounded-lg border border-border/80 bg-gradient-to-br from-primary/10 via-background to-muted/20 p-1.5 gap-1.5 backdrop-blur"
        aria-hidden
      >
        <span className="flex items-center justify-end gap-1">
          <span className="h-1.5 w-6 rounded-full border border-border/60 bg-card/70 px-1" />
          <span className="size-1.5 rounded-full bg-primary" />
        </span>
        <span className="grid grid-cols-[28%_1fr] gap-1.5 flex-1">
          <span className="flex flex-col gap-1 rounded-md border border-border/50 bg-card/60 p-1 shadow-xs">
            <span className="h-1 w-full rounded bg-primary/60" />
            <span className="h-1 w-3/4 rounded bg-muted-foreground/20" />
          </span>
          <span className="flex flex-col gap-1 rounded-md border border-border/50 bg-card/60 p-1.5 shadow-xs">
            <span className="h-1.5 w-2/3 rounded bg-foreground/80" />
            <span className="h-1 w-full rounded bg-muted-foreground/20" />
            <span className="h-1 w-4/5 rounded bg-muted-foreground/20" />
          </span>
        </span>
      </span>
    );
  }

  if (layoutId === 'flux') {
    return (
      <span
        className="mb-3 relative flex h-20 flex-col items-center justify-between overflow-hidden rounded-lg border border-border bg-card p-2"
        aria-hidden
      >
        <span className="flex flex-col items-center gap-1 w-3/5 pt-1">
          <span className="h-2 w-3/4 rounded bg-foreground/80" />
          <span className="h-1 w-full rounded bg-muted-foreground/20" />
          <span className="h-1 w-5/6 rounded bg-muted-foreground/20" />
          <span className="h-1 w-2/3 rounded bg-muted-foreground/20" />
        </span>
        {/* Signature Fumadocs Floating bottom dock pill */}
        <span className="flex w-4/5 items-center justify-between rounded-full border border-border/80 bg-popover px-2 py-0.5 shadow-sm">
          <span className="size-1.5 rounded-full bg-primary" />
          <span className="h-1 w-6 rounded bg-foreground/50" />
          <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        </span>
      </span>
    );
  }

  if (layoutId === 'spacious') {
    return (
      <span className="mb-3 flex h-20 overflow-hidden rounded-lg border border-border bg-card p-1 gap-1" aria-hidden>
        <span className="flex w-[24%] flex-col gap-1 border-r border-border/40 p-1">
          <span className="h-1.5 w-full rounded bg-primary/50" />
          <span className="h-1 w-3/4 rounded bg-muted-foreground/20" />
        </span>
        <span className="flex flex-1 flex-col gap-1 rounded-md border border-border bg-background p-1.5 shadow-xs">
          <span className="flex items-center justify-between border-b border-border/30 pb-1">
            <span className="h-1 w-6 rounded bg-muted-foreground/40" />
            <span className="h-1 w-4 rounded bg-primary/40" />
          </span>
          <span className="h-1.5 w-2/3 rounded bg-foreground/80 mt-0.5" />
          <span className="h-1 w-full rounded bg-muted-foreground/20" />
        </span>
      </span>
    );
  }

  // 'docs' default layout
  return (
    <span className="mb-3 grid h-20 grid-cols-[24%_1fr_20%] overflow-hidden rounded-lg border border-border bg-card p-1 gap-1" aria-hidden>
      <span className="flex flex-col gap-1 border-r border-border/40 pr-1 pt-1">
        <span className="h-1.5 w-full rounded bg-primary" />
        <span className="h-1 w-full rounded bg-muted-foreground/30" />
        <span className="h-1 w-3/4 rounded bg-muted-foreground/20" />
      </span>
      <span className="flex flex-col gap-1 px-1 pt-1">
        <span className="h-1.5 w-1/2 rounded bg-foreground/80" />
        <span className="h-1 w-full rounded bg-muted-foreground/20" />
        <span className="h-1 w-5/6 rounded bg-muted-foreground/20" />
      </span>
      <span className="flex flex-col gap-1 border-l border-border/40 pl-1 pt-1">
        <span className="h-1 w-3/4 rounded bg-muted-foreground/30" />
        <span className="h-1 w-1/2 rounded bg-muted-foreground/20" />
      </span>
    </span>
  );
}

export function DocsLayoutPicker({ value, onChange, className }: DocsLayoutPickerProps) {
  const t = useT();
  const selected = resolveDocsLayout(value);

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5', className)}>
      {DOCS_LAYOUT_IDS.map((layoutId) => {
        const active = selected === layoutId;
        return (
          <button
            aria-pressed={active}
            className={cn(
              'cursor-pointer rounded-xl border p-3 text-start outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50',
              active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/45',
            )}
            data-docs-layout={layoutId}
            key={layoutId}
            onClick={() => onChange(layoutId)}
            type="button"
          >
            <DocsLayoutThumbnail layoutId={layoutId} />
            <span className="block text-sm font-semibold text-foreground">{t(`settings.theme.layout.${layoutId}.name` as const)}</span>
            <span className="mt-1 block text-muted-foreground text-xs leading-relaxed">
              {t(`settings.theme.layout.${layoutId}.description` as const)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
