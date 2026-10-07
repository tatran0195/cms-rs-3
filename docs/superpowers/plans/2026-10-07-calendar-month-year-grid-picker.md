# Calendar & DatePicker Month/Year Quick Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Mantine-style Month and Year grid view mode selection for the Calendar and DatePicker components in `@cms/ui`, allowing users to click Month or Year in the header to jump directly using 3×4 interactive grids.

**Architecture:** Add a `viewMode` state (`'day' | 'month' | 'year'`) to `Calendar` and `InternalCalendar`. When in `'day'` view, the header splits the month and year into two interactive buttons. Clicking Month displays a 12-month grid (`CalendarMonthGrid`), and clicking Year displays a 12-year decade grid (`CalendarYearGrid`). Selecting a grid cell updates the focused date on the calendar state and transitions down the hierarchy (`year` → `month` → `day`).

**Tech Stack:** React 19, TypeScript 7, `@internationalized/date`, `react-aria`, `react-stately`, `@cms/ui-preset`, `@cms/icons`.

## Global Constraints

- Package target: `packages/ui` (`@cms/ui`)
- Design tokens: `@cms/ui-preset/theme.css` (`bg-ui-bg-component`, `text-ui-fg-base`, `bg-ui-bg-interactive`, `text-ui-fg-on-color`, `border-ui-border-interactive`)
- Zero layout shift: The 3×4 month and year grids must match the approximate bounding box of `CalendarGrid` (min-height 228px).

---

### Task 1: Create CalendarMonthGrid and CalendarYearGrid Components

**Files:**
- Create: `packages/ui/src/components/calendar/calendar-month-grid.tsx`
- Create: `packages/ui/src/components/calendar/calendar-year-grid.tsx`
- Create: `packages/ui/src/components/calendar/calendar-grids.spec.tsx`

**Interfaces:**
- Consumes:
  - `@internationalized/date` (`CalendarDate`)
  - `react-aria` (`useLocale`)
  - `clx` from `@/utils/clx`
- Produces:
  - `<CalendarMonthGrid focusedDate={CalendarDate} onSelectMonth={(month: number) => void} minValue?={CalendarDate} maxValue?={CalendarDate} />`
  - `<CalendarYearGrid focusedDate={CalendarDate} decadeStart={number} onSelectYear={(year: number) => void} minValue?={CalendarDate} maxValue?={CalendarDate} />`

- [ ] **Step 1: Write the failing unit tests**

Create `packages/ui/src/components/calendar/calendar-grids.spec.tsx`:
```tsx
import '@testing-library/jest-dom/vitest';
import { CalendarDate } from '@internationalized/date';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CalendarMonthGrid } from './calendar-month-grid';
import { CalendarYearGrid } from './calendar-year-grid';

describe('CalendarMonthGrid', () => {
  it('renders all 12 months and selects a month', () => {
    const onSelectMonth = vi.fn();
    const focusedDate = new CalendarDate(2026, 10, 7);

    render(
      <CalendarMonthGrid focusedDate={focusedDate} onSelectMonth={onSelectMonth} />,
    );

    const aprilBtn = screen.getByRole('button', { name: /^Apr/i });
    expect(aprilBtn).toBeInTheDocument();

    fireEvent.click(aprilBtn);
    expect(onSelectMonth).toHaveBeenCalledWith(4);
  });
});

describe('CalendarYearGrid', () => {
  it('renders 12 years in decade and selects a year', () => {
    const onSelectYear = vi.fn();
    const focusedDate = new CalendarDate(2026, 10, 7);

    render(
      <CalendarYearGrid
        focusedDate={focusedDate}
        decadeStart={2020}
        onSelectYear={onSelectYear}
      />,
    );

    const year2024Btn = screen.getByRole('button', { name: '2024' });
    expect(year2024Btn).toBeInTheDocument();

    fireEvent.click(year2024Btn);
    expect(onSelectYear).toHaveBeenCalledWith(2024);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test calendar-grids.spec.tsx`
Expected: FAIL due to missing `./calendar-month-grid` and `./calendar-year-grid`.

- [ ] **Step 3: Implement CalendarMonthGrid**

Create `packages/ui/src/components/calendar/calendar-month-grid.tsx`:
```tsx
'use client';

import { type CalendarDate, getLocalTimeZone, today } from '@internationalized/date';
import * as React from 'react';
import { useLocale } from 'react-aria';
import { clx } from '@/utils/clx';

interface CalendarMonthGridProps {
  focusedDate: CalendarDate;
  onSelectMonth: (month: number) => void;
  minValue?: CalendarDate | null;
  maxValue?: CalendarDate | null;
}

const CalendarMonthGrid = ({ focusedDate, onSelectMonth, minValue, maxValue }: CalendarMonthGridProps) => {
  const { locale } = useLocale();
  const currentToday = React.useMemo(() => today(getLocalTimeZone()), []);

  const formatter = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short' }),
    [locale],
  );

  const months = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const sampleDate = new Date(focusedDate.year, i, 1);
      const label = formatter.format(sampleDate);

      let isDisabled = false;
      if (minValue) {
        if (focusedDate.year < minValue.year || (focusedDate.year === minValue.year && monthNum < minValue.month)) {
          isDisabled = true;
        }
      }
      if (maxValue) {
        if (focusedDate.year > maxValue.year || (focusedDate.year === maxValue.year && monthNum > maxValue.month)) {
          isDisabled = true;
        }
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
    });
  }, [focusedDate.year, focusedDate.month, minValue, maxValue, formatter, currentToday]);

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
```

- [ ] **Step 4: Implement CalendarYearGrid**

Create `packages/ui/src/components/calendar/calendar-year-grid.tsx`:
```tsx
'use client';

import { type CalendarDate, getLocalTimeZone, today } from '@internationalized/date';
import * as React from 'react';
import { clx } from '@/utils/clx';

interface CalendarYearGridProps {
  focusedDate: CalendarDate;
  decadeStart: number;
  onSelectYear: (year: number) => void;
  minValue?: CalendarDate | null;
  maxValue?: CalendarDate | null;
}

const CalendarYearGrid = ({
  focusedDate,
  decadeStart,
  onSelectYear,
  minValue,
  maxValue,
}: CalendarYearGridProps) => {
  const currentToday = React.useMemo(() => today(getLocalTimeZone()), []);

  const years = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
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
    });
  }, [decadeStart, focusedDate.year, minValue, maxValue, currentToday.year]);

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
```

- [ ] **Step 5: Run unit tests to verify they pass**

Run: `bun run test calendar-grids.spec.tsx`
Expected: PASS with 2 tests passed.

---

### Task 2: Create CalendarHeader & Integrate into Calendar and InternalCalendar

**Files:**
- Create: `packages/ui/src/components/calendar/calendar-header.tsx`
- Modify: `packages/ui/src/components/calendar/calendar.tsx`
- Modify: `packages/ui/src/components/calendar/_internal-calendar.tsx`
- Modify: `packages/ui/src/components/calendar/index.ts`

**Interfaces:**
- Consumes:
  - `CalendarMonthGrid`
  - `CalendarYearGrid`
  - `CalendarButton`
  - `state` from `useCalendarState`
- Produces:
  - Seamless header navigation and grid toggling across `Calendar` and `DatePicker`.

- [ ] **Step 1: Implement CalendarHeader component**

Create `packages/ui/src/components/calendar/calendar-header.tsx`:
```tsx
'use client';

import { TriangleLeftMini, TriangleRightMini } from '@cms/icons';
import type { CalendarDate } from '@internationalized/date';
import * as React from 'react';
import type { AriaButtonProps } from 'react-aria';
import { useLocale } from 'react-aria';
import { IconButton } from '@/components/icon-button';
import { CalendarButton } from './calendar-button';

export type CalendarViewMode = 'day' | 'month' | 'year';

interface CalendarHeaderProps {
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  focusedDate: CalendarDate;
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

  const monthFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long' }),
    [locale],
  );

  const monthLabel = React.useMemo(() => {
    return monthFormatter.format(new Date(focusedDate.year, focusedDate.month - 1, 1));
  }, [focusedDate.year, focusedDate.month, monthFormatter]);

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
          <>
            <button
              type="button"
              onClick={() => onViewModeChange('month')}
              className="txt-compact-small-plus text-ui-fg-base hover:bg-ui-bg-base hover:text-ui-fg-base rounded px-1.5 py-0.5 transition-colors cursor-pointer select-none"
              aria-label="Switch to month view"
            >
              {monthLabel}
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('year')}
              className="txt-compact-small-plus text-ui-fg-base hover:bg-ui-bg-base hover:text-ui-fg-base rounded px-1.5 py-0.5 transition-colors cursor-pointer select-none"
              aria-label="Switch to year view"
            >
              {focusedDate.year}
            </button>
          </>
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
```

- [ ] **Step 2: Update `calendar.tsx` with view mode switching**

Modify `packages/ui/src/components/calendar/calendar.tsx`:
Add `viewMode` and `decadeStart` state, integrate `CalendarHeader`, and conditionally render `CalendarGrid`, `CalendarMonthGrid`, or `CalendarYearGrid`.

- [ ] **Step 3: Update `_internal-calendar.tsx` with view mode switching**

Modify `packages/ui/src/components/calendar/_internal-calendar.tsx`:
Update with identical `viewMode` logic so `DatePicker` gains the exact same Mantine-style quick selection capabilities.

- [ ] **Step 4: Update `packages/ui/src/components/calendar/index.ts`**

Export the new components if necessary.

- [ ] **Step 5: Run typecheck and existing tests**

Run: `bun run typecheck; if ($?) { bun run test }`
Expected: PASS with 0 errors.

---

### Task 3: Comprehensive Unit Tests & Interactive Verification

**Files:**
- Create/Update: `packages/ui/src/components/calendar/calendar.spec.tsx`

- [ ] **Step 1: Write integration tests in `calendar.spec.tsx`**

Test clicking Month button switches to Month grid, clicking a month navigates back to Day view with that month focused, and clicking Year button allows decade/year navigation.

- [ ] **Step 2: Run all tests in `packages/ui`**

Run: `bun run test`
Expected: All tests pass.

- [ ] **Step 3: Verify in live Storybook**

Open Storybook and interact with `Calendar` and `DatePicker` stories to verify smooth visual transitions and correct styling tokens.
