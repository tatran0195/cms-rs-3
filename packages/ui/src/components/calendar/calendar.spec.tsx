import '@testing-library/jest-dom/vitest';
import { CalendarDate } from '@internationalized/date';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InternalCalendar } from './_internal-calendar';
import { Calendar } from './calendar';

describe('Calendar', () => {
  it('renders day view by default with clickable month/year level button', () => {
    const defaultDate = new Date(2026, 9, 7); // October 7, 2026
    render(<Calendar defaultValue={defaultDate} />);

    const levelBtn = screen.getByRole('button', { name: 'Switch to month view' });
    expect(levelBtn).toHaveTextContent('October 2026');
  });

  it('switches to month grid when clicking level button and returns to day view on month select', () => {
    const defaultDate = new Date(2026, 9, 7);
    render(<Calendar defaultValue={defaultDate} />);

    const levelBtn = screen.getByRole('button', { name: 'Switch to month view' });
    fireEvent.click(levelBtn);

    const marchBtn = screen.getByRole('button', { name: /^Mar/i });
    expect(marchBtn).toBeInTheDocument();

    fireEvent.click(marchBtn);
    expect(screen.getByRole('button', { name: 'Switch to month view' })).toHaveTextContent('March 2026');
  });

  it('switches to year grid via month view and returns to month view on year select', () => {
    const defaultDate = new Date(2026, 9, 7);
    render(<Calendar defaultValue={defaultDate} />);

    // Click October 2026 to enter month view
    fireEvent.click(screen.getByRole('button', { name: 'Switch to month view' }));

    // In month view, click 2026 to enter year view
    const yearBtn = screen.getByRole('button', { name: 'Switch to year view' });
    expect(yearBtn).toHaveTextContent('2026');
    fireEvent.click(yearBtn);

    expect(screen.getByText(/2019 – 2030/i)).toBeInTheDocument();

    const year2028Btn = screen.getByRole('button', { name: '2028' });
    expect(year2028Btn).toBeInTheDocument();

    fireEvent.click(year2028Btn);
    expect(screen.getByRole('button', { name: 'Switch to year view' })).toHaveTextContent('2028');
  });
});

describe('InternalCalendar', () => {
  it('supports month and year quick selection within InternalCalendar', () => {
    const value = new CalendarDate(2026, 10, 7);
    render(<InternalCalendar defaultValue={value} />);

    const levelBtn = screen.getByRole('button', { name: 'Switch to month view' });
    expect(levelBtn).toHaveTextContent('October 2026');
    fireEvent.click(levelBtn);

    const novBtn = screen.getByRole('button', { name: /^Nov/i });
    expect(novBtn).toBeInTheDocument();
    fireEvent.click(novBtn);

    expect(screen.getByRole('button', { name: 'Switch to month view' })).toHaveTextContent('November 2026');
  });
});
