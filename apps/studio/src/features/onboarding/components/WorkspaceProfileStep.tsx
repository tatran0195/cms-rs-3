import { Input } from '@cms/design-system/components/ui/input';
import { Label } from '@cms/design-system/components/ui/label';
import { Textarea } from '@cms/design-system/components/ui/textarea';
import { Building2, Globe, Image as ImageIcon } from 'lucide-react';

export interface WorkspaceProfileData {
  name: string;
  slug: string;
  logoUrl?: string;
  description?: string;
}

interface WorkspaceProfileStepProps {
  data: WorkspaceProfileData;
  onChange: (patch: Partial<WorkspaceProfileData>) => void;
  errors: Record<string, string>;
}

export function WorkspaceProfileStep({ data, onChange, errors }: WorkspaceProfileStepProps) {
  const handleNameChange = (newName: string) => {
    // If slug hasn't been custom edited or was derived from old name, auto-derive new slug
    const derivedSlug = newName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    onChange({
      name: newName,
      slug: data.slug === '' || data.slug === derivedSlug.slice(0, data.slug.length) ? derivedSlug : data.slug,
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ws-name">Workspace / Organization Name</Label>
          <div className="relative">
            <Building2 className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="ws-name"
              placeholder="e.g. Acme Corporation"
              className="pl-9"
              value={data.name}
              onChange={(e) => handleNameChange(e.target.value)}
              autoFocus
            />
          </div>
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ws-slug">Workspace Identifier (Slug)</Label>
          <div className="relative">
            <Globe className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="ws-slug"
              placeholder="e.g. acme-corp"
              className="pl-9 font-mono text-sm"
              value={data.slug}
              onChange={(e) =>
                onChange({
                  slug: e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, '')
                    .replace(/^-+|-+$/g, ''),
                })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">Used as the unique URL prefix for your company documentation portal.</p>
          {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ws-logo">Company Logo URL (Optional)</Label>
          <div className="relative">
            <ImageIcon className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="ws-logo"
              placeholder="https://company.com/assets/logo.svg"
              className="pl-9"
              value={data.logoUrl || ''}
              onChange={(e) => onChange({ logoUrl: e.target.value })}
            />
          </div>
          {data.logoUrl && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border p-2 bg-muted/30">
              <span className="text-xs text-muted-foreground">Preview:</span>
              {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: image error handler to hide broken image preview */}
              <img
                src={data.logoUrl}
                alt="Logo preview"
                className="max-h-6 max-w-24 object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ws-desc">Description (Optional)</Label>
          <Textarea
            id="ws-desc"
            rows={3}
            placeholder="Internal engineering and product documentation"
            value={data.description || ''}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
