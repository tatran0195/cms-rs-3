'use client';

import { type CalendarDate, createCalendar, type DateValue, getLocalTimeZone } from '@internationalized/date';
import * as React from 'react';
import { type CalendarProps as BaseCalendarProps, useCalendar, useLocale } from 'react-aria';
import { useCalendarState } from 'react-stately';
import { createCalendarDate, getDefaultCalendarDate, updateCalendarDate } from '@/utils/calendar';
import { CalendarGrid } from './calendar-grid';
import { CalendarHeader, type CalendarViewMode } from './calendar-header';
import { CalendarMonthGrid } from './calendar-month-grid';
import { CalendarYearGrid } from './calendar-year-grid';

interface CalendarValueProps {
  /**
   * The currently selected date.
   */
  value?: Date | null;
  /**
   * The date that is selected when the calendar first mounts (uncontrolled).
   */
  defaultValue?: Date | null;
  /**
   * A function that is triggered when the selected date changes.
   */
  onChange?: (value: Date | null) => void;
  /**
   * A function that determines whether a date is unavailable for selection.
   */
  isDateUnavailable?: (date: Date) => boolean;
  /**
   * The minimum date that can be selected.
   */
  minValue?: Date;
  /**
   * The maximum date that can be selected.
   */
  maxValue?: Date;
}

interface CalendarProps extends Omit<BaseCalendarProps<CalendarDate>, keyof CalendarValueProps>, CalendarValueProps {}

/**
 * Calendar component used to select a date.
 * Its props are based on [React Aria Calendar](https://react-spectrum.adobe.com/react-aria/Calendar.html#calendar-1).
 *
 * @excludeExternal
 */
const Calendar = (props: CalendarProps) => {
  const [value, setValue] = React.useState<CalendarDate | null | undefined>(() => getDefaultCalendarDate(props.value, props.defaultValue));

  const [viewMode, setViewMode] = React.useState<CalendarViewMode>('day');

  const { locale } = useLocale();
  const _props = React.useMemo(() => convertProps(props, setValue), [props]);

  const state = useCalendarState({
    ..._props,
    value,
    locale,
    createCalendar,
  });

  const [decadeStart, setDecadeStart] = React.useState(() => Math.floor(state.focusedDate.year / 10) * 10 - 1);

  React.useEffect(() => {
    setValue((prev) => (props.value ? updateCalendarDate(prev, props.value) : null));
  }, [props.value]);

  React.useEffect(() => {
    setDecadeStart(Math.floor(state.focusedDate.year / 10) * 10 - 1);
  }, [state.focusedDate.year]);

  const { calendarProps, prevButtonProps, nextButtonProps } = useCalendar({ value, ..._props }, state);

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
        <CalendarMonthGrid focusedDate={state.focusedDate} onSelectMonth={handleSelectMonth} minValue={_props.minValue} maxValue={_props.maxValue} />
      )}
      {viewMode === 'year' && (
        <CalendarYearGrid
          focusedDate={state.focusedDate}
          decadeStart={decadeStart}
          onSelectYear={handleSelectYear}
          minValue={_props.minValue}
          maxValue={_props.maxValue}
        />
      )}
    </div>
  );
};

function convertProps(
  props: CalendarProps,
  setValue: React.Dispatch<React.SetStateAction<CalendarDate | null | undefined>>,
): BaseCalendarProps<CalendarDate> {
  const {
    minValue,
    maxValue,
    isDateUnavailable: _isDateUnavailable,
    onChange: _onChange,
    value: __value__,
    defaultValue: __defaultValue__,
    ...rest
  } = props;

  const onChange = (value: CalendarDate | null) => {
    setValue(value);
    _onChange?.(value ? value.toDate(getLocalTimeZone()) : null);
  };

  const isDateUnavailable = (date: DateValue) => {
    const _date = date.toDate(getLocalTimeZone());

    return _isDateUnavailable ? _isDateUnavailable(_date) : false;
  };

  return {
    ...rest,
    onChange,
    isDateUnavailable,
    minValue: minValue ? createCalendarDate(minValue) : minValue,
    maxValue: maxValue ? createCalendarDate(maxValue) : maxValue,
  };
}

export { Calendar };
