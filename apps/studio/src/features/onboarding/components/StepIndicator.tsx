import { cn } from '@cms/design-system/lib/utils';
import { Building2, Check, Palette, Rocket, Shield, UserRound } from 'lucide-react';

export interface StepItem {
  id: number;
  title: string;
  description: string;
  icon: typeof UserRound;
}

export const ONBOARDING_STEPS: StepItem[] = [
  { id: 1, title: 'Admin Account', description: 'Primary administrator credentials', icon: UserRound },
  { id: 2, title: 'Workspace', description: 'Portal branding & identity', icon: Building2 },
  { id: 3, title: 'Authentication', description: 'Access & registration policies', icon: Shield },
  { id: 4, title: 'Appearance', description: 'Theme & interface language', icon: Palette },
  { id: 5, title: 'Launch', description: 'Review & initialize platform', icon: Rocket },
];

interface StepIndicatorProps {
  currentStep: number;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="w-full">
      <div className="grid grid-cols-5 gap-2 sm:gap-4">
        {ONBOARDING_STEPS.map((step) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const Icon = step.icon;

          return (
            <div key={step.id} className="flex flex-col items-center text-center">
              <div
                className={cn(
                  'flex size-9 sm:size-10 items-center justify-center rounded-xl border font-medium text-xs sm:text-sm transition-all duration-200',
                  isCompleted && 'border-emerald-600 bg-emerald-600 text-white shadow-sm',
                  isCurrent && 'border-primary bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/10',
                  !isCompleted && !isCurrent && 'border-border bg-card text-muted-foreground',
                )}
              >
                {isCompleted ? <Check className="size-4 sm:size-5 stroke-[2.5]" /> : <Icon className="size-4 sm:size-5" />}
              </div>
              <span
                className={cn(
                  'mt-2 hidden text-xs font-medium sm:block',
                  isCurrent ? 'text-foreground font-semibold' : 'text-muted-foreground',
                )}
              >
                {step.title}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${((currentStep - 1) / (ONBOARDING_STEPS.length - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}
