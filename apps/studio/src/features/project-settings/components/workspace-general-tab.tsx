import { useState } from 'react';
import { Button } from '@cms/design-system/components/ui/button';
import { Input } from '@cms/design-system/components/ui/input';
import { Label } from '@cms/design-system/components/ui/label';
import { Textarea } from '@cms/design-system/components/ui/textarea';
import { Skeleton } from '@cms/design-system/components/ui/skeleton';
import { useT } from '@cms/i18n/react';
import { Copy, Check, FolderGit2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspaceSettings, useUpdateWorkspaceSettings } from '@/hooks/api';
import { copyToClipboard } from '@/shared';
import { SettingsSection } from './section';

export function WorkspaceGeneralTab() {
  const t = useT();
  const { data: workspace, isPending } = useWorkspaceSettings();
  const updateSettings = useUpdateWorkspaceSettings();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [copied, setCopied] = useState(false);

  if (workspace && !initialized) {
    setName(workspace.name || '');
    setDescription((workspace as { description?: string }).description || '');
    setLogoUrl((workspace as { logo?: string; logoUrl?: string }).logo || (workspace as { logo?: string; logoUrl?: string }).logoUrl || '');
    setInitialized(true);
  }

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const handleCopySlug = async () => {
    if (workspace?.slug) {
      await copyToClipboard(workspace.slug);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Workspace name is required');
      return;
    }
    try {
      await updateSettings.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
      });
      toast.success(t('common.saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update workspace settings');
    }
  };

  const projectCount = typeof workspace?.project_count === 'number' ? workspace.project_count : 0;
  const memberCount = typeof workspace?.member_count === 'number' ? workspace.member_count : 1;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSave}>
        <SettingsSection
          title="Workspace Profile"
          description="Manage your company workspace identity and branding."
          action={
            <Button type="submit" disabled={updateSettings.isPending}>
              {updateSettings.isPending ? t('common.saving') : t('common.save')}
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ws-name">Workspace Name</Label>
              <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="ws-slug">Workspace Identifier (Slug)</Label>
              <div className="flex items-center gap-2">
                <Input id="ws-slug" value={workspace?.slug ?? ''} readOnly className="bg-muted text-muted-foreground font-mono text-sm" />
                <Button type="button" variant="outline" size="icon" onClick={handleCopySlug} title="Copy slug">
                  {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="ws-logo">Logo URL</Label>
              <Input id="ws-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="ws-desc">Description</Label>
              <Textarea id="ws-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Brief description of this workspace" />
            </div>
          </div>
        </SettingsSection>
      </form>

      <SettingsSection
        title="Workspace Overview"
        description="Operational metrics for this organization."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <FolderGit2 className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{projectCount}</div>
              <div className="text-xs text-muted-foreground">{t('nav.sites')}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{memberCount}</div>
              <div className="text-xs text-muted-foreground">{t('members.title')}</div>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
