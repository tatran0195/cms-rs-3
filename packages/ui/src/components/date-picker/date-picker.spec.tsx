import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DatePicker } from './date-picker';

describe('DatePicker', () => {
  it('opens popover and allows switching to month grid', () => {
    const date = new Date(2026, 9, 7);
    render(<DatePicker aria-label="Select date" defaultValue={date} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    const monthBtn = screen.getByRole('button', { name: 'Switch to month view' });
    expect(monthBtn).toBeInTheDocument();
    fireEvent.click(monthBtn);

    expect(screen.getByRole('button', { name: /^Jun/i })).toBeInTheDocument();
  });
});
