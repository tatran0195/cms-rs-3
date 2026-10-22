import { Button } from '@cms/design-system/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@cms/design-system/components/ui/dialog';
import { Input } from '@cms/design-system/components/ui/input';
import { Label } from '@cms/design-system/components/ui/label';
import { Switch } from '@cms/design-system/components/ui/switch';
import { useUpdateLanguage, useUpdateProjectConfig } from '@cms/sdk/react';
import type { NavAnchor } from '@cms/validators';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export interface AnchorSettingsDialogProps {
  projectId: string;
  languageId?: string | null;
  anchor?: NavAnchor | null;
  existingAnchors: NavAnchor[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (updatedAnchors: NavAnchor[]) => void;
}

export function AnchorSettingsDialog({
  projectId,
  languageId,
  anchor,
  existingAnchors,
  open,
  onOpenChange,
  onSaved,
}: AnchorSettingsDialogProps) {
  const updateLanguage = useUpdateLanguage(projectId);
  const updateProject = useUpdateProjectConfig(projectId);

  const isEditing = Boolean(anchor);
  const [label, setLabel] = useState(anchor?.label ?? '');
  const [href, setHref] = useState(anchor?.href ?? '');
  const [icon, setIcon] = useState(anchor?.icon ?? '');
  const [external, setExternal] = useState(anchor?.external ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(anchor?.label ?? '');
      setHref(anchor?.href ?? '');
      setIcon(anchor?.icon ?? '');
      setExternal(anchor?.external ?? false);
      setIsSubmitting(false);
      setIsDeleting(false);
    }
  }, [open, anchor]);

  const persistAnchors = async (nextAnchors: NavAnchor[]) => {
    if (languageId) {
      await updateLanguage.mutateAsync({
        id: languageId,
        body: {
          config: {
            navbar: {
              anchors: nextAnchors,
            },
          },
        },
      });
    } else {
      await updateProject.mutateAsync({
        navbar: {
          anchors: nextAnchors,
        },
      });
    }
    onSaved?.(nextAnchors);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLabel = label.trim();
    const cleanHref = href.trim();
    const cleanIcon = icon.trim();

    if (!cleanLabel) {
      toast.error('Anchor label cannot be empty');
      return;
    }

    if (!cleanHref) {
      toast.error('Anchor URL cannot be empty');
      return;
    }

    const newAnchorItem: NavAnchor = {
      label: cleanLabel,
      href: cleanHref,
      ...(cleanIcon ? { icon: cleanIcon } : {}),
      ...(external ? { external: true } : {}),
    };

    let nextAnchors: NavAnchor[];
    if (isEditing) {
      nextAnchors = existingAnchors.map((a) => (a === anchor ? newAnchorItem : a));
    } else {
      nextAnchors = [...existingAnchors, newAnchorItem];
    }

    setIsSubmitting(true);
    try {
      await persistAnchors(nextAnchors);
      toast.success(isEditing ? 'Anchor updated' : 'Anchor created');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save anchor');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!anchor) return;
    setIsDeleting(true);
    const nextAnchors = existingAnchors.filter((a) => a !== anchor);
    try {
      await persistAnchors(nextAnchors);
      toast.success('Anchor deleted');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete anchor');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Anchor Settings' : 'New Anchor'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Configure pinned sidebar anchor link.'
              : 'Add a pinned anchor link to the top of your sidebar.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="anchor-label">Label</Label>
            <Input
              id="anchor-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Community, GitHub Discussions"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="anchor-href">URL / Path</Label>
            <Input
              id="anchor-href"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="https://community.example.com or /changelog"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="anchor-icon">Icon (optional)</Label>
            <Input
              id="anchor-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="e.g. messages-square, github, life-buoy"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="anchor-external" className="text-xs font-medium cursor-pointer">
                External Link
              </Label>
              <p className="text-[11px] text-muted-foreground">Open in a new browser tab</p>
            </div>
            <Switch id="anchor-external" checked={external} onCheckedChange={setExternal} />
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
                Delete Anchor
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting || isDeleting}>
                {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Anchor'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
