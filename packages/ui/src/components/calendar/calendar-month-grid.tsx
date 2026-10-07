'use client';

import { type DateValue, getLocalTimeZone, today } from '@internationalized/date';
import * as React from 'react';
import { useLocale } from 'react-aria';
import { clx } from '@/utils/clx';

interface CalendarMonthGridProps {
  focusedDate: DateValue;
  onSelectMonth: (month: number) => void;
  minValue?: DateValue | null;
  maxValue?: DateValue | null;
}

const CalendarMonthGrid = ({ focusedDate, onSelectMonth, minValue, maxValue }: CalendarMonthGridProps) => {
  const { locale } = useLocale();
  const currentToday = React.useMemo(() => today(getLocalTimeZone()), []);

  const formatter = React.useMemo(() => new Intl.DateTimeFormat(locale, { month: 'short' }), [locale]);

  const months = React.useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const monthNum = i + 1;
        const sampleDate = new Date(focusedDate.year, i, 1);
        const label = formatter.format(sampleDate);

        let isDisabled = false;
        if (minValue && (focusedDate.year < minValue.year || (focusedDate.year === minValue.year && monthNum < minValue.month))) {
          isDisabled = true;
        }
        if (maxValue && (focusedDate.year > maxValue.year || (focusedDate.year === maxValue.year && monthNum > maxValue.month))) {
          isDisabled = true;
        }

        const isFocused = focusedDate.month === monthNum;
        const isCurrentMonth = currentToday.year === focusedDate.year && currentToday.month === monthNum;

        return {
          monthNum,
          label,
          isDisabled,
          isFocused,
          isCurrentMonth,
        };
      }),
    [focusedDate.year, focusedDate.month, minValue, maxValue, formatter, currentToday],
  );

  return (
    <div className="grid grid-cols-3 gap-1.5 p-1 min-h-[228px] items-center">
      {months.map(({ monthNum, label, isDisabled, isFocused, isCurrentMonth }) => (
        <button
          key={monthNum}
          type="button"
          disabled={isDisabled}
          onClick={() => onSelectMonth(monthNum)}
          className={clx(
            'txt-compact-small relative flex items-center justify-center rounded-md py-2.5 transition-colors cursor-pointer select-none outline-none',
            'bg-ui-bg-component text-ui-fg-base hover:bg-ui-bg-component-hover active:bg-ui-bg-component-hover',
            'focus-visible:ring-2 focus-visible:ring-ui-border-interactive',
            isFocused && '!bg-ui-bg-interactive !text-ui-fg-on-color font-medium',
            isCurrentMonth && !isFocused && 'border border-ui-border-interactive font-medium',
            isDisabled && '!text-ui-fg-disabled !pointer-events-none opacity-40',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

export { CalendarMonthGrid };
