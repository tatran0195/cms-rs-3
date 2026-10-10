import { Button } from '@cms/design-system/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@cms/design-system/components/ui/dialog';
import { Input } from '@cms/design-system/components/ui/input';
import { Label } from '@cms/design-system/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cms/design-system/components/ui/select';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangle, ShieldAlert, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSession } from '@/features/auth';
import { useMembers, useWorkspaceSettings } from '@/hooks/api';
import { useDeleteWorkspace, useTransferWorkspaceOwnership } from '../services/settings-api';
import { SettingsSection } from './section';

interface MemberItem {
  id: string;
  role: string;
  user: {
    id?: string;
    name?: string;
    email: string;
  };
}

export function WorkspaceDangerTab() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { data: rawMembers } = useMembers();
  const { data: workspace } = useWorkspaceSettings();

  const transferMutation = useTransferWorkspaceOwnership();
  const deleteMutation = useDeleteWorkspace();

  const members = (rawMembers as { members?: MemberItem[] } | undefined)?.members ?? [];
  const currentMember = members.find((m) => m.user?.id === session?.user?.id || m.user?.email === session?.user?.email);
  const isOwner = currentMember?.role === 'owner';

  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const eligibleTargets = members.filter((m) => m.id !== currentMember?.id && m.role !== 'owner');

  const handleTransfer = async () => {
    if (!selectedTargetId) return;
    try {
      await transferMutation.mutateAsync(selectedTargetId);
      toast.success('Workspace ownership transferred successfully');
      setTransferOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to transfer ownership');
    }
  };

  const handleDelete = async () => {
    if (confirmName !== workspace?.name) {
      toast.error('Workspace name does not match');
      return;
    }
    try {
      await deleteMutation.mutateAsync();
      toast.success('Workspace deleted');
      setDeleteOpen(false);
      navigate({ to: '/app' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete workspace');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Transfer Ownership Card */}
      <SettingsSection
        title="Transfer Workspace Ownership"
        description="Transfer ownership to another member. You will become an Admin and lose owner-level permissions."
        action={
          isOwner ? (
            <Button variant="outline" onClick={() => setTransferOpen(true)} disabled={eligibleTargets.length === 0}>
              <UserCheck className="size-4 mr-2" />
              Transfer Ownership
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <ShieldAlert className="size-4 text-amber-500" />
              Only the workspace owner can transfer ownership.
            </span>
          )
        }
      >
        <p className="text-sm text-muted-foreground">
          {eligibleTargets.length === 0
            ? 'You must have at least one other workspace member before ownership can be transferred.'
            : 'Transferring ownership is immediate. Ensure the target member is trusted with workspace deletion rights.'}
        </p>
      </SettingsSection>

      {/* Delete Workspace Card */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="size-5" />
              Delete Workspace
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Permanently remove this workspace, including all documentation projects, sites, and roles. This action cannot be undone.
            </p>
          </div>
          {isOwner ? (
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete Workspace
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 shrink-0">
              <ShieldAlert className="size-4 text-amber-500" />
              Only the workspace owner can delete the workspace.
            </span>
          )}
        </div>
      </div>

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Workspace Ownership</DialogTitle>
            <DialogDescription>Select an active workspace member to become the new owner. Your role will be changed to Admin.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="target-member">Select Member</Label>
            <Select value={selectedTargetId} onValueChange={(v) => setSelectedTargetId(v ?? '')}>
              <SelectTrigger id="target-member" className="w-full mt-1.5">
                <SelectValue placeholder="Choose a member" />
              </SelectTrigger>
              <SelectContent>
                {eligibleTargets.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.user?.name || m.user?.email} ({m.user?.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleTransfer} disabled={!selectedTargetId || transferMutation.isPending}>
              {transferMutation.isPending ? 'Transferring...' : 'Confirm Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Entire Workspace</DialogTitle>
            <DialogDescription>
              This is an irreversible destructive action. To confirm, type <strong>{workspace?.name}</strong> below.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="confirm-ws-name">Type workspace name</Label>
            <Input
              id="confirm-ws-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={workspace?.name}
              className="mt-1.5"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={confirmName !== workspace?.name || deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting...' : 'Permanently Delete Workspace'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
