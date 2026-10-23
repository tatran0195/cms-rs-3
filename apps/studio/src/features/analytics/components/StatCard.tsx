import { Card, CardDescription, CardHeader, CardTitle } from '@cms/design-system/components/ui/card';
import { Skeleton } from '@cms/design-system/components/ui/skeleton';
import type { ReactNode } from 'react';
import { useFormatters } from '@/shared';

/**
 * Compact KPI tile: label, big value, optional leading icon. Same Card anatomy
 * and type scale as SectionCard (the overview tiles) so every KPI grid looks
 * identical; unlike SectionCard it accepts `null` and shows "—" when a figure
 * is unknown (e.g. analytics unavailable).
 */
export function StatCard({
  label,
  value,
  icon,
  suffix,
  loading,
}: {
  label: string;
  value: number | string | null;
  icon?: ReactNode;
  suffix?: string;
  loading?: boolean;
}) {
  const { number } = useFormatters();
  const display = value === null ? '—' : typeof value === 'number' ? `${number(value)}${suffix ?? ''}` : `${value}${suffix ?? ''}`;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          {icon}
          {label}
        </CardDescription>
        {loading ? (
          <Skeleton className="mt-1 h-8 w-20" />
        ) : (
          <CardTitle className="font-semibold text-2xl tabular-nums tracking-tight @[200px]/card:text-3xl">{display}</CardTitle>
        )}
      </CardHeader>
    </Card>
  );
}
