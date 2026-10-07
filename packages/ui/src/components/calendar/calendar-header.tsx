'use client';

import { TriangleLeftMini, TriangleRightMini } from '@cms/icons';
import type { DateValue } from '@internationalized/date';
import * as React from 'react';
import type { AriaButtonProps } from 'react-aria';
import { useLocale } from 'react-aria';
import { IconButton } from '@/components/icon-button';
import { CalendarButton } from './calendar-button';

export type CalendarViewMode = 'day' | 'month' | 'year';

interface CalendarHeaderProps {
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  focusedDate: DateValue;
  decadeStart: number;
  onPrev: () => void;
  onNext: () => void;
  prevButtonProps: AriaButtonProps<'button'>;
  nextButtonProps: AriaButtonProps<'button'>;
}

const CalendarHeader = ({
  viewMode,
  onViewModeChange,
  focusedDate,
  decadeStart,
  onPrev,
  onNext,
  prevButtonProps,
  nextButtonProps,
}: CalendarHeaderProps) => {
  const { locale } = useLocale();

  const monthFormatter = React.useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long' }), [locale]);

  const monthLabel = React.useMemo(
    () => monthFormatter.format(new Date(focusedDate.year, focusedDate.month - 1, 1)),
    [focusedDate.year, focusedDate.month, monthFormatter],
  );

  return (
    <div className="bg-ui-bg-field border-base grid grid-cols-[28px_1fr_28px] items-center gap-1 rounded-md border p-0.5">
      {viewMode === 'day' ? (
        <CalendarButton {...prevButtonProps}>
          <TriangleLeftMini />
        </CalendarButton>
      ) : (
        <IconButton size="small" variant="transparent" className="rounded-[4px]" onClick={onPrev}>
          <TriangleLeftMini />
        </IconButton>
      )}

      <div className="flex items-center justify-center gap-1">
        {viewMode === 'day' && (
          <button
            type="button"
            onClick={() => onViewModeChange('month')}
            className="txt-compact-small-plus text-ui-fg-base hover:bg-ui-bg-base hover:text-ui-fg-base rounded px-2 py-0.5 transition-colors cursor-pointer select-none"
            aria-label="Switch to month view"
          >
            {monthLabel} {focusedDate.year}
          </button>
        )}

        {viewMode === 'month' && (
          <button
            type="button"
            onClick={() => onViewModeChange('year')}
            className="txt-compact-small-plus text-ui-fg-base hover:bg-ui-bg-base hover:text-ui-fg-base rounded px-1.5 py-0.5 transition-colors cursor-pointer select-none"
            aria-label="Switch to year view"
          >
            {focusedDate.year}
          </button>
        )}

        {viewMode === 'year' && (
          <span className="txt-compact-small-plus text-ui-fg-base select-none">
            {decadeStart} – {decadeStart + 11}
          </span>
        )}
      </div>

      {viewMode === 'day' ? (
        <CalendarButton {...nextButtonProps}>
          <TriangleRightMini />
        </CalendarButton>
      ) : (
        <IconButton size="small" variant="transparent" className="rounded-[4px]" onClick={onNext}>
          <TriangleRightMini />
        </IconButton>
      )}
    </div>
  );
};

export { CalendarHeader };
