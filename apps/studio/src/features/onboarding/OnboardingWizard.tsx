import { useState } from 'react';
import { Button } from '@cms/design-system/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@cms/design-system/components/ui/card';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Loader2, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { useCompleteSetup, useSetupStatus } from '@/hooks/api';
import { AdminAccountStep, type AdminAccountData } from './components/AdminAccountStep';
import { AppearanceStep, type AppearanceData } from './components/AppearanceStep';
import { AuthPoliciesStep, type AuthPoliciesData } from './components/AuthPoliciesStep';
import { ReviewLaunchStep } from './components/ReviewLaunchStep';
import { ONBOARDING_STEPS, StepIndicator } from './components/StepIndicator';
import { WorkspaceProfileStep, type WorkspaceProfileData } from './components/WorkspaceProfileStep';

export function OnboardingWizard() {
  const navigate = useNavigate();
  const { data: setupStatus, isLoading: isStatusLoading } = useSetupStatus();
  const completeSetup = useCompleteSetup();

  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [admin, setAdmin] = useState<AdminAccountData>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [workspace, setWorkspace] = useState<WorkspaceProfileData>({
    name: '',
    slug: '',
    logoUrl: '',
    description: '',
  });

  const [auth, setAuth] = useState<AuthPoliciesData>({
    allowPublicSignup: false,
    requireEmailVerification: false,
    enabledOauthProviders: [],
  });

  const [appearance, setAppearance] = useState<AppearanceData>({
    defaultTheme: 'system',
    defaultLocale: 'en',
  });

  const validateStep = (step: number): boolean => {
    const errs: Record<string, string> = {};

    if (step === 1) {
      if (!admin.name.trim() || admin.name.trim().length < 2) {
        errs.name = 'Please provide your full name (at least 2 characters).';
      }
      if (!admin.email.trim() || !admin.email.includes('@')) {
        errs.email = 'Please provide a valid work email address.';
      }
      if (!admin.password || admin.password.length < 8) {
        errs.password = 'Password must be at least 8 characters long.';
      }
      if (admin.password !== admin.confirmPassword) {
        errs.confirmPassword = 'Passwords do not match.';
      }
    } else if (step === 2) {
      if (!workspace.name.trim() || workspace.name.trim().length < 2) {
        errs.name = 'Workspace name must be at least 2 characters long.';
      }
      if (!workspace.slug.trim() || workspace.slug.trim().length < 2) {
        errs.slug = 'Workspace slug must be at least 2 characters long.';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setErrors({});
      setCurrentStep((prev) => Math.min(prev + 1, ONBOARDING_STEPS.length));
    }
  };

  const handleBack = () => {
    setErrors({});
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleFinish = async () => {
    if (!validateStep(1) || !validateStep(2)) {
      toast.error('Please resolve missing required fields before launching.');
      return;
    }

    try {
      await completeSetup.mutateAsync({
        adminName: admin.name.trim(),
        adminEmail: admin.email.trim(),
        adminPassword: admin.password,
        workspaceName: workspace.name.trim(),
        workspaceSlug: workspace.slug.trim(),
        workspaceLogoUrl: workspace.logoUrl?.trim() || undefined,
        workspaceDescription: workspace.description?.trim() || undefined,
        allowPublicSignup: auth.allowPublicSignup,
        requireEmailVerification: auth.requireEmailVerification,
        enabledOauthProviders: auth.enabledOauthProviders,
        defaultTheme: appearance.defaultTheme,
        defaultLocale: appearance.defaultLocale,
      });

      toast.success('Platform initialized successfully! Welcome to your workspace.');
      await navigate({ to: '/app' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to complete initial setup');
    }
  };

  if (isStatusLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Checking platform status...</p>
        </div>
      </div>
    );
  }

  const currentStepMeta = ONBOARDING_STEPS.find((s) => s.id === currentStep) ?? ONBOARDING_STEPS[0]!;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4 sm:p-8">
      <div className="w-full max-w-2xl space-y-6">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground shadow-sm">
              C
            </span>
            <span className="font-bold text-xl tracking-tight text-foreground">cms</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            First-Time Platform Setup
          </h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Configure your internal company documentation workspace in a few quick steps.
          </p>
        </div>

        {/* Stepper Card */}
        <Card className="border border-border/80 shadow-md">
          <CardHeader className="border-b border-border/60 pb-5">
            <StepIndicator currentStep={currentStep} />
            <div className="mt-4 pt-1">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{currentStepMeta.title}</h2>
              <p className="text-xs text-muted-foreground">{currentStepMeta.description}</p>
            </div>
          </CardHeader>

          <CardContent className="pt-6 min-h-[320px]">
            {currentStep === 1 && (
              <AdminAccountStep
                data={admin}
                onChange={(patch) => setAdmin((prev) => ({ ...prev, ...patch }))}
                errors={errors}
              />
            )}
            {currentStep === 2 && (
              <WorkspaceProfileStep
                data={workspace}
                onChange={(patch) => setWorkspace((prev) => ({ ...prev, ...patch }))}
                errors={errors}
              />
            )}
            {currentStep === 3 && (
              <AuthPoliciesStep
                data={auth}
                onChange={(patch) => setAuth((prev) => ({ ...prev, ...patch }))}
                configuredOauthProviders={setupStatus?.configuredOauthProviders ?? []}
              />
            )}
            {currentStep === 4 && (
              <AppearanceStep
                data={appearance}
                onChange={(patch) => setAppearance((prev) => ({ ...prev, ...patch }))}
              />
            )}
            {currentStep === 5 && (
              <ReviewLaunchStep
                admin={admin}
                workspace={workspace}
                auth={auth}
                appearance={appearance}
              />
            )}
          </CardContent>

          <CardFooter className="flex items-center justify-between border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1 || completeSetup.isPending}
            >
              <ArrowLeft className="mr-1.5 size-4" />
              Back
            </Button>

            {currentStep < ONBOARDING_STEPS.length ? (
              <Button type="button" onClick={handleNext}>
                Continue
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleFinish}
                disabled={completeSetup.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
              >
                {completeSetup.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Initializing Platform...
                  </>
                ) : (
                  <>
                    <Rocket className="mr-2 size-4" />
                    Initialize & Launch Platform
                  </>
                )}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
