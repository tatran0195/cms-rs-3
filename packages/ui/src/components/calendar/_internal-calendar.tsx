'use client';

import { createCalendar } from '@internationalized/date';
import * as React from 'react';
import { type CalendarProps, type DateValue, useCalendar, useLocale } from 'react-aria';
import { useCalendarState } from 'react-stately';
import { CalendarGrid } from './calendar-grid';
import { CalendarHeader, type CalendarViewMode } from './calendar-header';
import { CalendarMonthGrid } from './calendar-month-grid';
import { CalendarYearGrid } from './calendar-year-grid';

/**
 * InternalCalendar is the internal implementation of the Calendar component.
 * It's not for public use, but only used for other components like DatePicker.
 */
const InternalCalendar = <TDateValue extends DateValue>(props: CalendarProps<TDateValue>) => {
  const { locale } = useLocale();

  const [viewMode, setViewMode] = React.useState<CalendarViewMode>('day');

  const state = useCalendarState({
    ...props,
    locale,
    createCalendar,
  });

  const [decadeStart, setDecadeStart] = React.useState(() => Math.floor(state.focusedDate.year / 10) * 10 - 1);

  React.useEffect(() => {
    setDecadeStart(Math.floor(state.focusedDate.year / 10) * 10 - 1);
  }, [state.focusedDate.year]);

  const { calendarProps, prevButtonProps, nextButtonProps } = useCalendar(props, state);

  const handlePrev = () => {
    if (viewMode === 'month') {
      state.setFocusedDate(state.focusedDate.set({ year: state.focusedDate.year - 1 }));
    } else if (viewMode === 'year') {
      setDecadeStart((prev) => prev - 12);
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      state.setFocusedDate(state.focusedDate.set({ year: state.focusedDate.year + 1 }));
    } else if (viewMode === 'year') {
      setDecadeStart((prev) => prev + 12);
    }
  };

  const handleSelectMonth = (month: number) => {
    state.setFocusedDate(state.focusedDate.set({ month }));
    setViewMode('day');
  };

  const handleSelectYear = (year: number) => {
    state.setFocusedDate(state.focusedDate.set({ year }));
    setViewMode('month');
  };

  return (
    <div {...calendarProps} className="flex flex-col gap-y-2">
      <CalendarHeader
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        focusedDate={state.focusedDate}
        decadeStart={decadeStart}
        onPrev={handlePrev}
        onNext={handleNext}
        prevButtonProps={prevButtonProps}
        nextButtonProps={nextButtonProps}
      />
      {viewMode === 'day' && <CalendarGrid state={state} />}
      {viewMode === 'month' && (
        <CalendarMonthGrid focusedDate={state.focusedDate} onSelectMonth={handleSelectMonth} minValue={props.minValue} maxValue={props.maxValue} />
      )}
      {viewMode === 'year' && (
        <CalendarYearGrid
          focusedDate={state.focusedDate}
          decadeStart={decadeStart}
          onSelectYear={handleSelectYear}
          minValue={props.minValue}
          maxValue={props.maxValue}
        />
      )}
    </div>
  );
};

export { InternalCalendar };
