import { Button } from "@cms/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cms/design-system/components/ui/dialog";
import { Textarea } from "@cms/design-system/components/ui/textarea";
import { cn } from "@cms/design-system/lib/utils";
import { useT } from "@cms/i18n/react";
import type { ProjectThemeImportResult } from "@cms/sdk";
import { useImportProjectTheme } from "@cms/sdk/react";
import { type ThemeConfig, MAX_THEME_TEMPLATE_BYTES } from "@cms/shared/themes";
import { CheckCircle2, FileJson, Upload } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";

export interface ThemeImportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyTheme: (
    theme: ThemeConfig,
    appearance?: "light" | "dark" | "system",
  ) => void;
}

export function ThemeImportDialog({
  projectId,
  open,
  onOpenChange,
  onApplyTheme,
}: ThemeImportDialogProps) {
  const t = useT();
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importText, setImportText] = useState("");
  const [importTemplate, setImportTemplate] = useState<unknown>();
  const [importPreview, setImportPreview] =
    useState<ProjectThemeImportResult>();
  const fileInput = useRef<HTMLInputElement>(null);

  const importProjectTheme = useImportProjectTheme(projectId);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportText("");
    setImportTemplate(undefined);
    setImportPreview(undefined);
    if (file.size > MAX_THEME_TEMPLATE_BYTES) {
      toast.error(t("settings.theme.import.tooLarge"));
      return;
    }
    const text = await file.text();
    setImportText(text);
    try {
      const parsed = JSON.parse(text) as unknown;
      setImportTemplate(parsed);
      triggerPreview(parsed, importMode);
    } catch {
      toast.error(t("settings.theme.import.invalidJson"));
    }
  };

  const triggerPreview = (template: unknown, mode: "merge" | "replace") => {
    importProjectTheme.mutate(
      { template, mode, apply: false },
      {
        onSuccess: (result) => setImportPreview(result),
        onError: (err) => {
          setImportPreview(undefined);
          toast.error(
            err instanceof Error
              ? err.message
              : t("settings.theme.import.failed"),
          );
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
      toast.error(t("settings.theme.import.tooLarge"));
      return;
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      setImportTemplate(parsed);
      triggerPreview(parsed, importMode);
    } catch {
      // Allow user to finish typing JSON without erroring prematurely
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
            toast.success(t("settings.theme.import.applied"));
            onOpenChange(false);
            setImportText("");
            setImportTemplate(undefined);
            setImportPreview(undefined);
          }
        },
        onError: (err) => {
          toast.error(
            err instanceof Error
              ? err.message
              : t("settings.theme.import.failed"),
          );
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
            <span>{t("settings.theme.importTitle")}</span>
          </DialogTitle>
          <DialogDescription>
            {t("settings.theme.importHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File Picker & Mode Selection */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={handleFile}
              />
              <Button
                size="sm"
                variant="outline"
                className="cursor-pointer gap-1.5"
                onClick={() => fileInput.current?.click()}
                type="button"
              >
                <Upload className="size-3.5" />
                <span>{t("settings.theme.chooseFile")}</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t("settings.theme.importMode")}:
              </span>
              <div className="flex rounded-md border border-border bg-background p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setImportMode("merge");
                    if (importTemplate) triggerPreview(importTemplate, "merge");
                  }}
                  className={cn(
                    "rounded px-2.5 py-1 font-mono transition-colors cursor-pointer",
                    importMode === "merge"
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("settings.theme.importMerge")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportMode("replace");
                    if (importTemplate)
                      triggerPreview(importTemplate, "replace");
                  }}
                  className={cn(
                    "rounded px-2.5 py-1 font-mono transition-colors cursor-pointer",
                    importMode === "replace"
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("settings.theme.importReplace")}
                </button>
              </div>
            </div>
          </div>

          {/* JSON Textarea */}
          <Textarea
            value={importText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={t("settings.theme.importPlaceholder")}
            className="font-mono text-xs min-h-[140px]"
          />

          {/* Preview / Diff Box */}
          {importPreview && (
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span>
                  Valid Theme Template:{" "}
                  {importPreview.metadata?.name || "Untitled Theme"}
                </span>
              </div>
              <p className="text-muted-foreground">{importPreview.summary}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleApply}
            disabled={!importTemplate || importProjectTheme.isPending}
            type="button"
            className="cursor-pointer"
          >
            {importProjectTheme.isPending
              ? t("common.saving")
              : t("settings.theme.applyTheme")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
