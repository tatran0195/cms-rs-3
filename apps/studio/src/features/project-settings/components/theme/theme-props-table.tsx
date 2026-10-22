import { Input } from "@cms/design-system/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@cms/design-system/components/ui/select";
import { cn } from "@cms/design-system/lib/utils";
import type {
  ThemeConfig,
  DocsLayoutId,
  ThemeColorKey,
  ThemeColorTokens,
  ThemeComponents,
  ThemeLayout,
  ThemePresetId,
} from "@cms/shared/themes";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Upload,
} from "lucide-react";
import { useId, useState } from "react";
import { ThemeImportDialog } from "./theme-import-dialog";
import { ThemePaletteEditor } from "./theme-palette-editor";
import { formatPropSummary, type PropsTablePath } from "./types";

export interface ThemePropsTableProps {
  path: PropsTablePath;
  onNavigate: (path: PropsTablePath) => void;
  themeConfig: ThemeConfig;
  onThemeConfigChange: (
    config: ThemeConfig | ((prev: ThemeConfig) => ThemeConfig),
  ) => void;
  resolvedColors: {
    light: ThemeColorTokens;
    dark: ThemeColorTokens;
  };
  resolvedLayout: ThemeLayout;
  resolvedComponents: ThemeComponents;
  onReset: () => void;
  activePreset?: ThemePresetId;
  onSelectPreset?: (preset: ThemePresetId) => void;
  onExport?: () => void;
  onImportTheme?: (
    theme: ThemeConfig,
    appearance?: "light" | "dark" | "system",
  ) => void;
  projectId?: string;
  isExporting?: boolean;
  className?: string;
}

export function ThemePropsTable({
  path,
  onNavigate,
  themeConfig: _themeConfig,
  onThemeConfigChange,
  resolvedColors,
  resolvedLayout,
  resolvedComponents,
  onReset,
  activePreset,
  onSelectPreset,
  onExport,
  onImportTheme,
  projectId,
  isExporting,
  className,
}: ThemePropsTableProps) {
  const currentCategory = path[0];
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const setLayoutPart = <K extends keyof ThemeLayout>(
    key: K,
    value: ThemeLayout[K],
  ) => {
    onThemeConfigChange((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        [key]: value,
      },
    }));
  };

  const setComponentPart = <K extends keyof ThemeComponents>(
    key: K,
    value: ThemeComponents[K],
  ) => {
    onThemeConfigChange((prev) => ({
      ...prev,
      components: {
        ...prev.components,
        [key]: value,
      },
    }));
  };

  const handleColorChange = (
    mode: "light" | "dark",
    key: ThemeColorKey,
    value: string,
  ) => {
    onThemeConfigChange((prev) => ({
      ...prev,
      colors: {
        ...prev.colors,
        [mode]: {
          ...prev.colors?.[mode],
          [key]: value,
        },
      },
    }));
  };

  return (
    <div
      className={cn(
        "not-prose overflow-hidden rounded-xl border border-border bg-card text-card-foreground flex flex-col h-[280px]",
        className,
      )}
    >
      {/* Breadcrumbs Navigation Header */}
      <nav
        aria-label="Props navigation"
        className="flex h-10 shrink-0 items-center gap-1 border-b border-border/70 ps-4 pe-2 text-[0.8125rem] bg-card select-none"
      >
        {currentCategory && (
          <button
            type="button"
            onClick={() => onNavigate([])}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="size-3.5" />
          </button>
        )}
        <ol className="flex min-w-0 items-center gap-1">
          <li>
            {currentCategory ? (
              <button
                type="button"
                onClick={() => onNavigate([])}
                className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer font-medium transition-colors"
              >
                Props
              </button>
            ) : (
              <span className="px-1.5 py-0.5 text-foreground font-medium">
                Props
              </span>
            )}
          </li>
          {currentCategory && (
            <li className="flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
              <span className="font-mono font-medium text-foreground px-1.5 py-0.5">
                {currentCategory}
              </span>
            </li>
          )}
        </ol>

        <div className="ms-auto flex items-center gap-0.5">
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              disabled={isExporting}
              className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors disabled:opacity-50"
              title="Export Theme JSON"
              aria-label="Export Theme JSON"
            >
              <Download className="size-3.5" />
            </button>
          )}

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

          <button
            type="button"
            onClick={onReset}
            className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
            title="Reset Props"
            aria-label="Reset Props"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {/* ROOT PROPS TABLE VIEW */}
        {!currentCategory && (
          <div className="divide-y divide-border/60">
            <NavRow
              id="layout"
              name="layout"
              summary={formatPropSummary({
                docsLayout: resolvedLayout.docsLayout,
                pageWidth: resolvedLayout.pageWidth,
                contentWidth: resolvedLayout.contentWidth,
                density: resolvedLayout.density,
                radius: resolvedLayout.radius,
              })}
              type="object"
              onNavigate={() => onNavigate(["layout"])}
            />
            <NavRow
              id="header"
              name="header"
              summary={formatPropSummary({
                header: resolvedLayout.header,
                transparent: resolvedLayout.headerTransparentMode ?? "none",
              })}
              type="object"
              onNavigate={() => onNavigate(["header"])}
            />
            <NavRow
              id="sidebar"
              name="sidebar"
              summary={formatPropSummary({
                sidebar: resolvedLayout.sidebar,
                collapsible: resolvedLayout.sidebarCollapsible ?? true,
              })}
              type="object"
              onNavigate={() => onNavigate(["sidebar"])}
            />
            <NavRow
              id="themeSwitch"
              name="themeSwitch"
              summary={formatPropSummary({
                enabled: resolvedLayout.themeSwitchEnabled ?? true,
                mode: resolvedLayout.themeSwitchMode ?? "light-dark",
              })}
              type="object"
              onNavigate={() => onNavigate(["themeSwitch"])}
            />
            <NavRow
              id="toc"
              name="toc"
              summary={formatPropSummary({
                style: resolvedLayout.tocStyle ?? "clerk",
                depth: resolvedLayout.tocDepth ?? 3,
              })}
              type="object"
              onNavigate={() => onNavigate(["toc"])}
            />
            <NavRow
              id="palette"
              name="palette"
              summary={formatPropSummary(resolvedColors.light)}
              type="object"
              onNavigate={() => onNavigate(["palette"])}
            />
            <NavRow
              id="components"
              name="components"
              summary={formatPropSummary(resolvedComponents)}
              type="object"
              onNavigate={() => onNavigate(["components"])}
            />
          </div>
        )}

        {/* DRILL-DOWN: LAYOUT */}
        {currentCategory === "layout" && (
          <div className="divide-y divide-border/60">
            <EnumRow
              name="docsLayout"
              value={resolvedLayout.docsLayout ?? "docs"}
              options={["docs", "glass", "notebook", "flux", "spacious"]}
              onChange={(v) => setLayoutPart("docsLayout", v as DocsLayoutId)}
            />
            <EnumRow
              name="shell"
              value={resolvedLayout.shell}
              options={["reference", "editorial", "console"]}
              onChange={(v) =>
                setLayoutPart("shell", v as ThemeLayout["shell"])
              }
            />
            <EnumRow
              name="density"
              value={resolvedLayout.density}
              options={["compact", "comfortable", "relaxed"]}
              onChange={(v) =>
                setLayoutPart("density", v as ThemeLayout["density"])
              }
            />
            <EnumRow
              name="pageWidth"
              value={resolvedLayout.pageWidth ?? "balanced"}
              options={["focused", "balanced", "wide", "full"]}
              onChange={(v) =>
                setLayoutPart(
                  "pageWidth",
                  v as NonNullable<ThemeLayout["pageWidth"]>,
                )
              }
            />
            <EnumRow
              name="contentWidth"
              value={resolvedLayout.contentWidth}
              options={["focused", "balanced", "wide", "full"]}
              onChange={(v) =>
                setLayoutPart("contentWidth", v as ThemeLayout["contentWidth"])
              }
            />
            <EnumRow
              name="radius"
              value={resolvedLayout.radius}
              options={["sharp", "rounded", "pill"]}
              onChange={(v) =>
                setLayoutPart("radius", v as ThemeLayout["radius"])
              }
            />
          </div>
        )}

        {/* DRILL-DOWN: HEADER */}
        {currentCategory === "header" && (
          <div className="divide-y divide-border/60">
            <EnumRow
              name="header"
              value={resolvedLayout.header}
              options={["inline", "stacked", "floating"]}
              onChange={(v) =>
                setLayoutPart("header", v as ThemeLayout["header"])
              }
            />
            <EnumRow
              name="headerTransparentMode"
              value={resolvedLayout.headerTransparentMode ?? "none"}
              options={["none", "top", "always"]}
              onChange={(v) =>
                setLayoutPart(
                  "headerTransparentMode",
                  v as "none" | "top" | "always",
                )
              }
            />
          </div>
        )}

        {/* DRILL-DOWN: SIDEBAR */}
        {currentCategory === "sidebar" && (
          <div className="divide-y divide-border/60">
            <EnumRow
              name="sidebar"
              value={resolvedLayout.sidebar}
              options={["bordered", "soft", "rail"]}
              onChange={(v) =>
                setLayoutPart("sidebar", v as ThemeLayout["sidebar"])
              }
            />
            <BooleanRow
              name="sidebarCollapsible"
              value={resolvedLayout.sidebarCollapsible ?? true}
              onChange={(v) => setLayoutPart("sidebarCollapsible", v)}
            />
            <NumberRow
              name="sidebarDefaultOpenLevel"
              value={resolvedLayout.sidebarDefaultOpenLevel ?? 0}
              min={0}
              max={6}
              onChange={(v) => setLayoutPart("sidebarDefaultOpenLevel", v)}
            />
            <EnumRow
              name="navigation"
              value={resolvedLayout.navigation}
              options={["tree", "sectioned", "compact"]}
              onChange={(v) =>
                setLayoutPart("navigation", v as ThemeLayout["navigation"])
              }
            />
          </div>
        )}

        {/* DRILL-DOWN: THEME SWITCH */}
        {currentCategory === "themeSwitch" && (
          <div className="divide-y divide-border/60">
            <BooleanRow
              name="themeSwitchEnabled"
              value={resolvedLayout.themeSwitchEnabled ?? true}
              onChange={(v) => setLayoutPart("themeSwitchEnabled", v)}
            />
            <EnumRow
              name="themeSwitchMode"
              value={resolvedLayout.themeSwitchMode ?? "light-dark"}
              options={[
                "light-dark",
                "light-dark-system",
                "button",
                "dropdown",
              ]}
              onChange={(v) =>
                setLayoutPart(
                  "themeSwitchMode",
                  v as
                    | "light-dark"
                    | "light-dark-system"
                    | "button"
                    | "dropdown",
                )
              }
            />
          </div>
        )}

        {/* DRILL-DOWN: TABLE OF CONTENTS (TOC) */}
        {currentCategory === "toc" && (
          <div className="divide-y divide-border/60">
            <EnumRow
              name="tocStyle"
              value={resolvedLayout.tocStyle ?? "clerk"}
              options={["clerk", "normal", "block"]}
              onChange={(v) =>
                setLayoutPart("tocStyle", v as "normal" | "clerk" | "block")
              }
            />
            <NumberRow
              name="tocDepth"
              value={resolvedLayout.tocDepth ?? 3}
              min={1}
              max={6}
              onChange={(v) => setLayoutPart("tocDepth", v)}
            />
          </div>
        )}

        {/* DRILL-DOWN: PALETTE */}
        {currentCategory === "palette" && (
          <ThemePaletteEditor
            colors={resolvedColors}
            activePreset={activePreset}
            onSelectPreset={onSelectPreset}
            onColorChange={handleColorChange}
          />
        )}

        {/* DRILL-DOWN: COMPONENTS */}
        {currentCategory === "components" && (
          <div className="divide-y divide-border/60">
            <EnumRow
              name="codeBlocks"
              value={resolvedComponents.codeBlocks}
              options={["system", "dim", "vivid"]}
              onChange={(v) =>
                setComponentPart(
                  "codeBlocks",
                  v as ThemeComponents["codeBlocks"],
                )
              }
            />
            <EnumRow
              name="callouts"
              value={resolvedComponents.callouts}
              options={["soft", "outline", "solid"]}
              onChange={(v) =>
                setComponentPart("callouts", v as ThemeComponents["callouts"])
              }
            />
            <EnumRow
              name="cards"
              value={resolvedComponents.cards}
              options={["bordered", "lifted", "flat"]}
              onChange={(v) =>
                setComponentPart("cards", v as ThemeComponents["cards"])
              }
            />
            <EnumRow
              name="tabs"
              value={resolvedComponents.tabs}
              options={["underline", "pills", "boxed"]}
              onChange={(v) =>
                setComponentPart("tabs", v as ThemeComponents["tabs"])
              }
            />
            <EnumRow
              name="tables"
              value={resolvedComponents.tables}
              options={["lines", "rows", "cards"]}
              onChange={(v) =>
                setComponentPart("tables", v as ThemeComponents["tables"])
              }
            />
          </div>
        )}
      </div>

      {projectId && onImportTheme && importDialogOpen && (
        <ThemeImportDialog
          projectId={projectId}
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onApplyTheme={onImportTheme}
        />
      )}
    </div>
  );
}

/* =========================================================================
   INTERNAL ROW COMPONENTS
   ========================================================================= */

function NavRow({
  id,
  name,
  summary,
  type,
  onNavigate,
}: {
  id: string;
  name: string;
  summary: string;
  type: string;
  onNavigate: () => void;
}) {
  return (
    <div className="grid @sm:grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 items-center gap-1 py-2.5 ps-4 pe-3">
        <span className="truncate font-mono text-[0.8125rem] text-foreground font-medium">
          {name}
        </span>
      </div>
      <div className="flex min-h-9 items-stretch text-[0.8125rem] transition-colors @sm:border-s @sm:border-border/60 hover:bg-muted/30">
        <button
          type="button"
          data-prop-id={id}
          onClick={onNavigate}
          className="group/nav flex min-w-0 flex-1 items-center ps-3 text-start outline-none cursor-pointer"
        >
          <span className="truncate text-muted-foreground group-hover/nav:text-foreground transition-colors font-mono text-xs">
            {summary}
          </span>
        </button>
        <button
          type="button"
          onClick={onNavigate}
          className="group/nav inline-flex shrink-0 items-center gap-1 pe-3 ps-2 text-muted-foreground/70 hover:text-foreground cursor-pointer transition-colors"
        >
          <span className="font-mono text-[0.6875rem] uppercase tracking-wider">
            {type}
          </span>
          <ChevronRight className="size-3.5 transition-transform group-hover/nav:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}

function BooleanRow({
  name,
  value,
  onChange,
}: {
  name: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="grid @sm:grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)] hover:bg-muted/20 transition-colors">
      <div className="flex min-w-0 items-center gap-1 py-2 ps-4 pe-3">
        <span className="truncate font-mono text-[0.8125rem] text-foreground font-medium">
          {name}
        </span>
      </div>
      <div className="flex min-h-9 items-center justify-between px-3 @sm:border-s @sm:border-border/60">
        <div className="flex items-center gap-1">
          {[true, false].map((option) => (
            <button
              key={String(option)}
              type="button"
              aria-pressed={value === option}
              onClick={() => onChange(option)}
              className={cn(
                "h-6 rounded px-2.5 font-mono text-xs transition-colors cursor-pointer",
                value === option
                  ? "bg-primary text-primary-foreground font-medium shadow-2xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {String(option)}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-muted-foreground/70">
          boolean
        </span>
      </div>
    </div>
  );
}

function EnumRow({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  return (
    <div className="grid @sm:grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)] hover:bg-muted/20 transition-colors">
      <div className="flex min-w-0 items-center gap-1 py-2 ps-4 pe-3">
        <span className="truncate font-mono text-[0.8125rem] text-foreground font-medium">
          {name}
        </span>
      </div>
      <div className="flex min-h-9 items-center justify-between px-3 @sm:border-s @sm:border-border/60">
        <Select
          value={value}
          onValueChange={(val) => {
            if (val) onChange(val);
          }}
        >
          <SelectTrigger
            data-prop-name={name}
            className="h-7 w-auto min-w-28 text-xs font-mono border-border/80 bg-background shadow-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt} className="text-xs font-mono">
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="font-mono text-xs text-muted-foreground/70">enum</span>
      </div>
    </div>
  );
}

function NumberRow({
  name,
  value,
  min = 0,
  max = 10,
  onChange,
}: {
  name: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
}) {
  const inputId = useId();
  return (
    <div className="grid @sm:grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 items-center gap-1 py-2 ps-4 pe-3">
        <label
          htmlFor={inputId}
          className="truncate font-mono text-[0.8125rem] text-foreground font-medium cursor-pointer"
        >
          {name}
        </label>
      </div>
      <div className="flex min-h-9 items-center px-3 text-[0.8125rem] @sm:border-s @sm:border-border/60">
        <Input
          id={inputId}
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-7 w-20 text-xs font-mono border-border/80 bg-background shadow-none"
        />
      </div>
    </div>
  );
}
