'use client';

import { type DateValue, getLocalTimeZone, today } from '@internationalized/date';
import * as React from 'react';
import { clx } from '@/utils/clx';

interface CalendarYearGridProps {
  focusedDate: DateValue;
  decadeStart: number;
  onSelectYear: (year: number) => void;
  minValue?: DateValue | null;
  maxValue?: DateValue | null;
}

const CalendarYearGrid = ({ focusedDate, decadeStart, onSelectYear, minValue, maxValue }: CalendarYearGridProps) => {
  const currentToday = React.useMemo(() => today(getLocalTimeZone()), []);

  const years = React.useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const year = decadeStart + i;

        let isDisabled = false;
        if (minValue && year < minValue.year) {
          isDisabled = true;
        }
        if (maxValue && year > maxValue.year) {
          isDisabled = true;
        }

        const isFocused = focusedDate.year === year;
        const isCurrentYear = currentToday.year === year;

        return {
          year,
          isDisabled,
          isFocused,
          isCurrentYear,
        };
      }),
    [decadeStart, focusedDate.year, minValue, maxValue, currentToday.year],
  );

  return (
    <div className="grid grid-cols-3 gap-1.5 p-1 min-h-[228px] items-center">
      {years.map(({ year, isDisabled, isFocused, isCurrentYear }) => (
        <button
          key={year}
          type="button"
          disabled={isDisabled}
          onClick={() => onSelectYear(year)}
          className={clx(
            'txt-compact-small relative flex items-center justify-center rounded-md py-2.5 transition-colors cursor-pointer select-none outline-none',
            'bg-ui-bg-component text-ui-fg-base hover:bg-ui-bg-component-hover active:bg-ui-bg-component-hover',
            'focus-visible:ring-2 focus-visible:ring-ui-border-interactive',
            isFocused && '!bg-ui-bg-interactive !text-ui-fg-on-color font-medium',
            isCurrentYear && !isFocused && 'border border-ui-border-interactive font-medium',
            isDisabled && '!text-ui-fg-disabled !pointer-events-none opacity-40',
          )}
        >
          {year}
        </button>
      ))}
    </div>
  );
};

export { CalendarYearGrid };
