import { getWeeksInMonth } from '@internationalized/date';
import { type AriaCalendarGridProps, useCalendarGrid, useLocale } from 'react-aria';
import type { CalendarState } from 'react-stately';
import { CalendarCell } from './calendar-cell';

interface CalendarGridProps extends AriaCalendarGridProps {
  state: CalendarState;
}

const CalendarGrid = ({ state, ...props }: CalendarGridProps) => {
  const { locale } = useLocale();
  const { gridProps, headerProps, weekDays } = useCalendarGrid(props, state);

  const weeksInMonth = getWeeksInMonth(state.visibleRange.start, locale);

  return (
    <table {...gridProps}>
      <thead {...headerProps}>
        <tr>
          {weekDays.map((day, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: week days can have duplicate names (e.g. S, T)
            <th key={`${day}-${index}`} className="txt-compact-small-plus text-ui-fg-muted size-8 p-1 rounded-md">
              {day}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...new Array(weeksInMonth).keys()].map((weekIndex) => (
          <tr key={weekIndex}>
            {state.getDatesInWeek(weekIndex).map((date, i) =>
              date ? (
                <CalendarCell key={date.toString()} state={state} date={date} />
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: empty padding cells have no date
                <td key={i} />
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export { CalendarGrid };
