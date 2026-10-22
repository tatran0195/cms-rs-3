import { Button } from '@cms/design-system/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@cms/design-system/components/ui/dialog';
import { Input } from '@cms/design-system/components/ui/input';
import { Label } from '@cms/design-system/components/ui/label';
import { Switch } from '@cms/design-system/components/ui/switch';
import { useT } from '@cms/i18n/react';
import { useUpdateLanguage, useUpdateProjectConfig } from '@cms/sdk/react';
import { slugify } from '@cms/shared/utils';
import type { NavTabItem } from '@cms/validators';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export interface TabSettingsDialogProps {
  projectId: string;
  languageId?: string | null;
  tab?: NavTabItem | null;
  existingTabs: NavTabItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (updatedTabs: NavTabItem[]) => void;
}

export function TabSettingsDialog({
  projectId,
  languageId,
  tab,
  existingTabs,
  open,
  onOpenChange,
  onSaved,
}: TabSettingsDialogProps) {
  const t = useT();
  const updateLanguage = useUpdateLanguage(projectId);
  const updateProject = useUpdateProjectConfig(projectId);

  const isEditing = Boolean(tab);
  const [label, setLabel] = useState(tab?.label ?? '');
  const [href, setHref] = useState(tab?.href ?? '');
  const [external, setExternal] = useState(tab?.external ?? false);
  const [isPathManuallyEdited, setIsPathManuallyEdited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(tab?.label ?? '');
      setHref(tab?.href ?? '');
      setExternal(tab?.external ?? false);
      setIsPathManuallyEdited(Boolean(tab?.href));
      setIsSubmitting(false);
      setIsDeleting(false);
    }
  }, [open, tab]);

  const handleLabelChange = (val: string) => {
    setLabel(val);
    if (!isEditing && !isPathManuallyEdited && !external) {
      const slug = slugify(val);
      setHref(slug ? `/${slug}` : '');
    }
  };

  const handleHrefChange = (val: string) => {
    setIsPathManuallyEdited(true);
    setHref(val);
  };

  const persistTabs = async (nextTabs: NavTabItem[]) => {
    if (languageId) {
      await updateLanguage.mutateAsync({
        id: languageId,
        body: {
          config: {
            navbar: {
              tabs: nextTabs,
            },
          },
        },
      });
    } else {
      await updateProject.mutateAsync({
        navbar: {
          tabs: nextTabs,
        },
      });
    }
    onSaved?.(nextTabs);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLabel = label.trim();
    let cleanHref = href.trim();

    if (!cleanLabel) {
      toast.error('Tab name cannot be empty');
      return;
    }

    if (!external && cleanHref && !cleanHref.startsWith('/')) {
      cleanHref = `/${cleanHref}`;
    }

    // Check duplicate path
    const isDuplicate = existingTabs.some(
      (t) => (!tab || t !== tab) && t.href?.toLowerCase() === cleanHref.toLowerCase(),
    );
    if (cleanHref && isDuplicate) {
      toast.error('Another tab already uses this base path');
      return;
    }

    const newTabItem: NavTabItem = {
      label: cleanLabel,
      ...(cleanHref ? { href: cleanHref } : {}),
      ...(external ? { external: true } : {}),
      ...(tab?.items ? { items: tab.items } : {}),
    };

    let nextTabs: NavTabItem[];
    if (isEditing) {
      nextTabs = existingTabs.map((t) => (t === tab ? newTabItem : t));
    } else {
      nextTabs = [...existingTabs, newTabItem];
    }

    setIsSubmitting(true);
    try {
      await persistTabs(nextTabs);
      toast.success(isEditing ? 'Tab updated' : 'Tab created');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save tab');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!tab) return;
    setIsDeleting(true);
    const nextTabs = existingTabs.filter((t) => t !== tab);
    try {
      await persistTabs(nextTabs);
      toast.success('Tab deleted');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete tab');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Tab Settings' : 'New Tab'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Configure tab navigation and base path.'
              : 'Create a top-level documentation tab section.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="tab-name">Name</Label>
            <Input
              id="tab-name"
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. Documentation, API Reference"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tab-href">Base Path</Label>
            <Input
              id="tab-href"
              value={href}
              onChange={(e) => handleHrefChange(e.target.value)}
              placeholder={external ? 'https://example.com' : 'e.g. /docs or /api'}
            />
            <p className="text-[11px] text-muted-foreground">
              {external
                ? 'External URL this tab will link to.'
                : 'Pages starting with this URL path will be grouped under this tab.'}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="tab-external" className="text-xs font-medium cursor-pointer">
                External Link
              </Label>
              <p className="text-[11px] text-muted-foreground">Open in a new browser tab</p>
            </div>
            <Switch id="tab-external" checked={external} onCheckedChange={setExternal} />
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
            {isEditing ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting || isSubmitting}
                className="cursor-pointer"
              >
                <Trash2 className="size-3.5 mr-1.5" />
                Delete Tab
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting || isDeleting}>
                {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Tab'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
