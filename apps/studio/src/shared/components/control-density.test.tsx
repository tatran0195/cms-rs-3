// @vitest-environment jsdom

import { Input } from '@cms/design-system/components/ui/input';
import { SegmentedControl, SegmentedControlItem } from '@cms/design-system/components/ui/segmented-control';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
});

async function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(element));
  return container;
}

it('segmented settings actions expose selection and never submit their surrounding form', async () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  function Example() {
    const [value, setValue] = useState('en');
    return (
      <form onSubmit={submit}>
        <SegmentedControl density="compact" dir="rtl">
          <SegmentedControlItem active={value === 'en'} onClick={() => setValue('en')}>
            English
          </SegmentedControlItem>
          <SegmentedControlItem active={value === 'he'} onClick={() => setValue('he')}>
            עברית
          </SegmentedControlItem>
          <SegmentedControlItem active={false} disabled onClick={() => setValue('disabled')}>
            Unavailable
          </SegmentedControlItem>
        </SegmentedControl>
      </form>
    );
  }

  const container = await render(<Example />);
  const buttons = Array.from(container.querySelectorAll('button'));
  expect(buttons).toHaveLength(3);
  expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
  expect(buttons[1]?.getAttribute('aria-pressed')).toBe('false');
  expect(buttons[2]?.getAttribute('disabled')).not.toBeNull();

  await act(async () => {
    buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  expect(submit).not.toHaveBeenCalled();
  expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');
});

it('settings density inputs stay accessible in dark-theme shells', async () => {
  const container = await render(
    <div className="dark">
      <Input aria-label="Base font size" density="compact" defaultValue="16" />
    </div>,
  );
  const input = container.querySelector('input');
  expect(input).not.toBeNull();
  expect(input?.getAttribute('data-density')).toBe('compact');
});
