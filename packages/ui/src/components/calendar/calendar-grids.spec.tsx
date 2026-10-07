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

    render(<CalendarMonthGrid focusedDate={focusedDate} onSelectMonth={onSelectMonth} />);

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

    render(<CalendarYearGrid focusedDate={focusedDate} decadeStart={2020} onSelectYear={onSelectYear} />);

    const year2024Btn = screen.getByRole('button', { name: '2024' });
    expect(year2024Btn).toBeInTheDocument();

    fireEvent.click(year2024Btn);
    expect(onSelectYear).toHaveBeenCalledWith(2024);
  });
});
