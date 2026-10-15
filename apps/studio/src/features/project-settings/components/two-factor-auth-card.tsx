import { Alert, AlertDescription, AlertTitle } from '@cms/design-system/components/ui/alert';
import { Badge } from '@cms/design-system/components/ui/badge';
import { Button } from '@cms/design-system/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@cms/design-system/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@cms/design-system/components/ui/dialog';
import { Input } from '@cms/design-system/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@cms/design-system/components/ui/input-otp';
import { Label } from '@cms/design-system/components/ui/label';
import { Check, Copy, Download, KeyRound, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { MfaSetupResponse } from '@cms/auth';
import { useMfaDisable, useMfaSetup, useMfaVerify, useSession } from '@/features/auth';
import { copyToClipboard } from '@/shared';

export function TwoFactorAuthCard() {
  const { data: session, refetch: refetchSession } = useSession();
  const mfaSetup = useMfaSetup();
  const mfaVerify = useMfaVerify();
  const mfaDisable = useMfaDisable();

  const userRecord = session?.user as Record<string, unknown> | undefined;
  const isMfaEnabled = Boolean(userRecord?.mfaEnabled ?? userRecord?.mfa_enabled);

  // Setup modal state
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupStage, setSetupStage] = useState<'qr' | 'recovery_codes'>('qr');
  const [setupData, setSetupData] = useState<MfaSetupResponse | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Disable modal state
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  const handleStartSetup = async () => {
    try {
      const data = await mfaSetup.mutateAsync();
      setSetupData(data);
      setSetupStage('qr');
      setVerifyCode('');
      setRecoveryCodes([]);
      setSetupOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to initialize 2FA setup');
    }
  };

  const handleVerifySetup = async () => {
    if (!setupData) return;
    if (verifyCode.trim().length !== 6) {
      toast.error('Please enter a valid 6-digit verification code');
      return;
    }
    try {
      await mfaVerify.mutateAsync({
        code: verifyCode.trim(),
        secret: setupData.secret,
        recoveryCodes: setupData.recoveryCodes,
      });
      setRecoveryCodes(setupData.recoveryCodes);
      setSetupStage('recovery_codes');
      await refetchSession();
      toast.success('Two-factor authentication successfully verified and enabled!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid 2FA verification code');
    }
  };

  const handleDisableMfa = async () => {
    if (!disableCode.trim()) {
      toast.error('Please enter your 2FA verification code or recovery code');
      return;
    }
    try {
      await mfaDisable.mutateAsync({ code: disableCode.trim() });
      setDisableOpen(false);
      setDisableCode('');
      await refetchSession();
      toast.success('Two-factor authentication disabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disable 2FA');
    }
  };

  const handleCopyCodes = async () => {
    const text = recoveryCodes.join('\n');
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedCodes(true);
      toast.success('Recovery codes copied to clipboard');
      setTimeout(() => setCopiedCodes(false), 2000);
    }
  };

  const handleDownloadCodes = () => {
    const blob = new Blob([`CMS Emergency Recovery Codes\nGenerated: ${new Date().toISOString()}\n\n${recoveryCodes.join('\n')}\n\nKeep these codes safe and offline. Each code can only be used once.`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cms-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Recovery codes downloaded');
  };

  return (
    <>
      <Card className="border-border">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`grid size-9 place-items-center rounded-lg border ${isMfaEnabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : 'border-muted bg-muted/50 text-muted-foreground'}`}>
                {isMfaEnabled ? <ShieldCheck className="size-5" /> : <ShieldAlert className="size-5" />}
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Two-Factor Authentication</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Protect your account with an extra verification step using a TOTP authenticator app.
                </CardDescription>
              </div>
            </div>
            <div>
              {isMfaEnabled ? (
                <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600" variant="outline">
                  <ShieldCheck className="mr-1 size-3.5" /> Enabled
                </Badge>
              ) : (
                <Badge className="border-border text-muted-foreground" variant="outline">
                  <ShieldAlert className="mr-1 size-3.5" /> Disabled
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground leading-relaxed max-w-xl">
              {isMfaEnabled
                ? 'Your account is secured with two-factor authentication. You will be required to provide a 6-digit TOTP code during sign in.'
                : 'When enabled, signing in requires your password and a time-based verification code from your authenticator app (e.g. 1Password, Google Authenticator, Bitwarden).'}
            </div>
            <div>
              {isMfaEnabled ? (
                <Button
                  onClick={() => {
                    setDisableCode('');
                    setDisableOpen(true);
                  }}
                  size="sm"
                  variant="destructive"
                >
                  Disable 2FA
                </Button>
              ) : (
                <Button disabled={mfaSetup.isPending} onClick={handleStartSetup} size="sm">
                  <Smartphone className="mr-1.5 size-4" />
                  Enable 2FA
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setup Modal */}
      <Dialog onOpenChange={setSetupOpen} open={setupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              {setupStage === 'qr' ? 'Set Up Two-Factor Authentication' : 'Emergency Recovery Codes'}
            </DialogTitle>
            <DialogDescription>
              {setupStage === 'qr'
                ? 'Scan the QR code with your authenticator app or enter the secret key manually.'
                : 'Save these backup recovery codes immediately in a secure password manager.'}
            </DialogDescription>
          </DialogHeader>

          {setupStage === 'qr' && setupData && (
            <div className="space-y-4 py-2">
              <div className="flex flex-col items-center justify-center rounded-xl border bg-muted/20 p-4">
                <img
                  alt="2FA QR Code"
                  className="size-48 rounded-lg border bg-white p-2 shadow-sm"
                  src={`data:image/png;base64,${setupData.qrPngBase64}`}
                />
                <div className="mt-3 text-center">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Manual Secret Key</span>
                  <div className="mt-1 flex items-center justify-center gap-1.5">
                    <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold select-all">
                      {setupData.secret}
                    </code>
                    <Button
                      onClick={async () => {
                        const ok = await copyToClipboard(setupData.secret);
                        if (ok) {
                          setCopiedSecret(true);
                          toast.success('Secret copied');
                          setTimeout(() => setCopiedSecret(false), 1500);
                        }
                      }}
                      size="icon-sm"
                      variant="ghost"
                    >
                      {copiedSecret ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mfa-verify-code">Enter 6-digit confirmation code</Label>
                <div className="flex justify-center" dir="ltr">
                  <InputOTP
                    autoFocus
                    disabled={mfaVerify.isPending}
                    id="mfa-verify-code"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={setVerifyCode}
                    onComplete={handleVerifySetup}
                    value={verifyCode}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot className="bg-background" index={0} />
                      <InputOTPSlot className="bg-background" index={1} />
                      <InputOTPSlot className="bg-background" index={2} />
                      <InputOTPSlot className="bg-background" index={3} />
                      <InputOTPSlot className="bg-background" index={4} />
                      <InputOTPSlot className="bg-background" index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>

              <DialogFooter className="mt-4">
                <Button onClick={() => setSetupOpen(false)} type="button" variant="outline">
                  Cancel
                </Button>
                <Button
                  disabled={mfaVerify.isPending || verifyCode.trim().length !== 6}
                  onClick={handleVerifySetup}
                  type="button"
                >
                  {mfaVerify.isPending ? 'Verifying...' : 'Activate 2FA'}
                </Button>
              </DialogFooter>
            </div>
          )}

          {setupStage === 'recovery_codes' && (
            <div className="space-y-4 py-2">
              <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
                <ShieldAlert className="size-4 text-amber-600" />
                <AlertTitle className="font-semibold text-xs">Save these recovery codes!</AlertTitle>
                <AlertDescription className="text-xs text-amber-800 dark:text-amber-300">
                  Each backup code can be used once if you lose access to your device. Store them in a secure offline location or password manager.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 font-mono text-xs font-semibold">
                {recoveryCodes.map((code, index) => (
                  <div className="rounded bg-background px-2.5 py-1.5 text-center border shadow-xs" key={index}>
                    {code}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Button className="flex-1" onClick={handleCopyCodes} size="sm" variant="outline">
                  {copiedCodes ? <Check className="mr-1.5 size-4 text-emerald-500" /> : <Copy className="mr-1.5 size-4" />}
                  {copiedCodes ? 'Copied' : 'Copy All'}
                </Button>
                <Button className="flex-1" onClick={handleDownloadCodes} size="sm" variant="outline">
                  <Download className="mr-1.5 size-4" /> Download .txt
                </Button>
              </div>

              <DialogFooter className="mt-4">
                <Button className="w-full" onClick={() => setSetupOpen(false)} type="button">
                  Done, I Have Saved My Codes
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Disable Modal */}
      <Dialog onOpenChange={setDisableOpen} open={disableOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-5" />
              Disable Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              Are you sure? This will remove 2FA verification requirement and invalidate your recovery backup codes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="mfa-disable-code">Enter current 6-digit TOTP or recovery code to confirm</Label>
            <Input
              autoFocus
              id="mfa-disable-code"
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="e.g. 123456 or recovery code"
              value={disableCode}
            />
          </div>

          <DialogFooter>
            <Button onClick={() => setDisableOpen(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={mfaDisable.isPending || !disableCode.trim()}
              onClick={handleDisableMfa}
              type="button"
              variant="destructive"
            >
              {mfaDisable.isPending ? 'Disabling...' : 'Confirm & Disable'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
