import { Button } from '@cms/design-system/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@cms/design-system/components/ui/dialog';
import { Input } from '@cms/design-system/components/ui/input';
import { Label } from '@cms/design-system/components/ui/label';
import { Switch } from '@cms/design-system/components/ui/switch';
import { useUpdateLanguage, useUpdateProjectConfig } from '@cms/sdk/react';
import type { NavLink } from '@cms/validators';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export interface LinkSettingsDialogProps {
  projectId: string;
  languageId?: string | null;
  link?: NavLink | null;
  existingLinks: NavLink[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (updatedLinks: NavLink[]) => void;
}

export function LinkSettingsDialog({ projectId, languageId, link, existingLinks, open, onOpenChange, onSaved }: LinkSettingsDialogProps) {
  const updateLanguage = useUpdateLanguage(projectId);
  const updateProject = useUpdateProjectConfig(projectId);

  const isEditing = Boolean(link);
  const [label, setLabel] = useState(link?.label ?? '');
  const [href, setHref] = useState(link?.href ?? '');
  const [external, setExternal] = useState(link?.external ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(link?.label ?? '');
      setHref(link?.href ?? '');
      setExternal(link?.external ?? false);
      setIsSubmitting(false);
      setIsDeleting(false);
    }
  }, [open, link]);

  const persistLinks = async (nextLinks: NavLink[]) => {
    if (languageId) {
      await updateLanguage.mutateAsync({
        id: languageId,
        body: {
          config: {
            navbar: {
              links: nextLinks,
            },
          },
        },
      });
    } else {
      await updateProject.mutateAsync({
        config: {
          navbar: {
            links: nextLinks,
          },
        },
      });
    }
    onSaved?.(nextLinks);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLabel = label.trim();
    const cleanHref = href.trim();

    if (!cleanLabel) {
      toast.error('Link label cannot be empty');
      return;
    }

    if (!cleanHref) {
      toast.error('Link URL cannot be empty');
      return;
    }

    const newLinkItem: NavLink = {
      label: cleanLabel,
      href: cleanHref,
      ...(external ? { external: true } : {}),
      ...(link?.items ? { items: link.items } : {}),
    };

    let nextLinks: NavLink[];
    if (isEditing) {
      nextLinks = existingLinks.map((l) => (l === link ? newLinkItem : l));
    } else {
      nextLinks = [...existingLinks, newLinkItem];
    }

    setIsSubmitting(true);
    try {
      await persistLinks(nextLinks);
      toast.success(isEditing ? 'Navbar link updated' : 'Navbar link created');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save navbar link');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!link) return;
    setIsDeleting(true);
    const nextLinks = existingLinks.filter((l) => l !== link);
    try {
      await persistLinks(nextLinks);
      toast.success('Navbar link deleted');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete navbar link');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Link Settings' : 'New Navbar Link'}</DialogTitle>
          <DialogDescription>{isEditing ? 'Configure top navigation bar link.' : 'Add a navigation link to your site top header.'}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="link-label">Label</Label>
            <Input id="link-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Changelog, Status" required autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="link-href">URL / Path</Label>
            <Input
              id="link-href"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="https://status.example.com or /changelog"
              required
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="link-external" className="text-xs font-medium cursor-pointer">
                External Link
              </Label>
              <p className="text-[11px] text-muted-foreground">Open in a new browser tab</p>
            </div>
            <Switch id="link-external" checked={external} onCheckedChange={setExternal} />
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
                Delete Link
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting || isDeleting}>
                {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Link'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
